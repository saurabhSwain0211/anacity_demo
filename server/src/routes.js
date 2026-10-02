import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { query } from './db.js';
import { authenticate, requireRole, signToken } from './auth.js';
import { runAgent } from './agent.js';
import { canTransition, missingRequiredFields, ALLOWED_ADMIN_STATUSES } from './policy.js';

const router = Router();
const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(uploadDir,{recursive:true});
const upload = multer({ dest:uploadDir, limits:{fileSize:8*1024*1024}, fileFilter:(req,file,cb)=>{
  const allowed=['application/pdf','image/png','image/jpeg'];
  cb(allowed.includes(file.mimetype)?null:new Error('Only PDF, PNG, and JPEG files are allowed'),allowed.includes(file.mimetype));
}});
const loginSchema=z.object({email:z.string().email(),password:z.string().min(1)});
router.post('/auth/login',async(req,res,next)=>{
  try{
    const body=loginSchema.parse(req.body);
    const r=await query('SELECT id,name,email,password_hash,role,community_id FROM users WHERE email=$1',[body.email.toLowerCase()]);
    const user=r.rows[0];
    if(!user || !(await bcrypt.compare(body.password,user.password_hash))) return res.status(401).json({error:'Invalid email or password'});
    res.json({token:signToken(user),user:{id:user.id,name:user.name,email:user.email,role:user.role,communityId:user.community_id}});
  }catch(e){next(e);}
});
router.get('/me',authenticate,(req,res)=>res.json({user:req.user}));
router.get('/rules',authenticate,async(req,res,next)=>{
  try{const r=await query('SELECT config FROM community_rules WHERE community_id=$1',[req.user.communityId]);res.json(r.rows[0]?.config??{});}catch(e){next(e);}
});
router.get('/requests',authenticate,async(req,res,next)=>{
  try{
    const sql=req.user.role==='admin'
      ?'SELECT r.*,u.name AS resident_name,u.email AS resident_email FROM move_requests r JOIN users u ON u.id=r.resident_id WHERE r.community_id=$1 ORDER BY r.created_at DESC'
      :'SELECT * FROM move_requests WHERE resident_id=$1 ORDER BY created_at DESC';
    const r=await query(sql,[req.user.role==='admin'?req.user.communityId:req.user.id]);
    res.json({requests:r.rows});
  }catch(e){next(e);}
});
const requestSchema=z.object({
  type:z.enum(['move_in','move_out']),
  details:z.object({
    residentName:z.string().optional(),unitNumber:z.string().optional(),plannedDate:z.string().optional(),
    phone:z.string().optional(),vehicleDetails:z.string().optional(),notes:z.string().optional()
  }).passthrough()
});
router.post('/requests',authenticate,requireRole('resident'),async(req,res,next)=>{
  try{
    const body=requestSchema.parse(req.body);
    const id=(await query(`INSERT INTO move_requests(resident_id,community_id,type,status,unit_number,planned_date,details)
      VALUES($1,$2,$3,'draft',$4,$5,$6) RETURNING *`,
      [req.user.id,req.user.communityId,body.type,body.details.unitNumber||null,body.details.plannedDate||null,body.details])).rows[0];
    res.status(201).json({request:id});
  }catch(e){next(e);}
});
router.patch('/requests/:id',authenticate,requireRole('resident'),async(req,res,next)=>{
  try{
    const body=requestSchema.partial().extend({details:requestSchema.shape.details.optional()}).parse(req.body);
    const old=(await query('SELECT * FROM move_requests WHERE id=$1 AND resident_id=$2',[req.params.id,req.user.id])).rows[0];
    if(!old)return res.status(404).json({error:'Request not found'});
    if(['approved','rejected'].includes(old.status))return res.status(409).json({error:'Request is closed'});
    const details={...old.details,...(body.details||{})};
    const type=body.type||old.type;
    const r=await query('UPDATE move_requests SET type=$1,details=$2,unit_number=$3,planned_date=$4,updated_at=NOW() WHERE id=$5 RETURNING *',
      [type,details,details.unitNumber||null,details.plannedDate||null,old.id]);
    res.json({request:r.rows[0]});
  }catch(e){next(e);}
});
router.post('/requests/:id/submit',authenticate,requireRole('resident'),async(req,res,next)=>{
  try{
    const r=(await query('SELECT * FROM move_requests WHERE id=$1 AND resident_id=$2',[req.params.id,req.user.id])).rows[0];
    if(!r)return res.status(404).json({error:'Request not found'});
    const rules=(await query('SELECT config FROM community_rules WHERE community_id=$1',[req.user.communityId])).rows[0]?.config??{};
    const missing=missingRequiredFields({type:r.type,details:r.details},rules);
    if(missing.length)return res.status(422).json({error:'Required information is missing',missingFields:missing});
    const updated=(await query("UPDATE move_requests SET status='submitted',updated_at=NOW() WHERE id=$1 RETURNING *",[r.id])).rows[0];
    res.json({request:updated});
  }catch(e){next(e);}
});
router.patch('/requests/:id/status',authenticate,requireRole('admin'),async(req,res,next)=>{
  try{
    const status=z.enum(['under_review','needs_information','approved','rejected']).parse(req.body.status);
    if(!ALLOWED_ADMIN_STATUSES.has(status))return res.status(400).json({error:'Invalid status'});
    const old=(await query('SELECT * FROM move_requests WHERE id=$1 AND community_id=$2',[req.params.id,req.user.communityId])).rows[0];
    if(!old)return res.status(404).json({error:'Request not found'});
    if(!canTransition(old.status,status))return res.status(409).json({error:`Cannot transition ${old.status} to ${status}`});
    const updated=(await query('UPDATE move_requests SET status=$1,admin_note=$2,updated_at=NOW() WHERE id=$3 RETURNING *',
      [status,String(req.body.note||'').slice(0,1000),old.id])).rows[0];
    res.json({request:updated});
  }catch(e){next(e);}
});
router.post('/requests/:id/documents',authenticate,upload.single('file'),async(req,res,next)=>{
  try{
    if(!req.file)return res.status(400).json({error:'File required'});
    const r=(await query("SELECT id FROM move_requests WHERE id=$1 AND ($2::text='admin' OR resident_id=$3)",[req.params.id,req.user.role,req.user.id])).rows[0];
    if(!r){fs.unlinkSync(req.file.path);return res.status(404).json({error:'Request not found or access denied'});}
    const saved=(await query('INSERT INTO documents(request_id,uploaded_by,original_name,mime_type,storage_path) VALUES($1,$2,$3,$4,$5) RETURNING id,original_name,mime_type,created_at',
      [r.id,req.user.id,req.file.originalname,req.file.mimetype,req.file.path])).rows[0];
    res.status(201).json({document:saved});
  }catch(e){next(e);}
});
router.get('/requests/:id/documents',authenticate,async(req,res,next)=>{
  try{
    const r=await query("SELECT d.id,d.original_name,d.mime_type,d.created_at FROM documents d JOIN move_requests m ON m.id=d.request_id WHERE m.id=$1 AND ($2::text='admin' OR m.resident_id=$3)",[req.params.id,req.user.role,req.user.id]);
    res.json({documents:r.rows});
  }catch(e){next(e);}
});
router.post('/agent/chat',authenticate,async(req,res,next)=>{
  try{
    const schema=z.object({message:z.string().min(1).max(4000),requestId:z.string().uuid().optional()});
    const body=schema.parse(req.body);
    let history=[];
    if(body.requestId){
      const own=await query("SELECT id FROM move_requests WHERE id=$1 AND ($2::text='admin' OR resident_id=$3)",[body.requestId,req.user.role,req.user.id]);
      if(!own.rows[0])return res.status(404).json({error:'Request not found or access denied'});
      history=(await query('SELECT role,content FROM agent_messages WHERE request_id=$1 ORDER BY created_at DESC LIMIT 12',[body.requestId])).rows.reverse();
    }
    const result=await runAgent({message:body.message,user:{id:req.user.sub||req.user.id,role:req.user.role,communityId:req.user.communityId},requestId:body.requestId,history});
    if(body.requestId){
      await query('INSERT INTO agent_messages(request_id,role,content,tool_calls) VALUES($1,$2,$3,$4)',[body.requestId,'user',body.message,JSON.stringify([])]);
      await query('INSERT INTO agent_messages(request_id,role,content,tool_calls) VALUES($1,$2,$3,$4)',[body.requestId,'assistant',result.reply,JSON.stringify(result.toolCalls)]);
    }
    res.json(result);
  }catch(e){next(e);}
});
router.use((err,req,res,next)=>{
  if(err instanceof z.ZodError)return res.status(400).json({error:'Validation failed',details:err.issues});
  if(err.code==='23505')return res.status(409).json({error:'Duplicate record'});
  if(err.code==='LIMIT_FILE_SIZE')return res.status(413).json({error:'File exceeds 8 MB limit'});
  res.status(500).json({error:err.message||'Internal server error'});
});
export default router;
