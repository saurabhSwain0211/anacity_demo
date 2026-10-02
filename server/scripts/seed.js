import dotenv from 'dotenv';dotenv.config();
import bcrypt from 'bcryptjs';
import {pool} from '../src/db.js';
try{
 const c=(await pool.query("INSERT INTO communities(name) VALUES('ANACITY Demo Community') RETURNING id")).rows[0];
 const hashA=await bcrypt.hash('Admin123!',10),hashR=await bcrypt.hash('Resident123!',10);
 await pool.query('INSERT INTO users(name,email,password_hash,role,community_id) VALUES($1,$2,$3,$4,$5),($6,$7,$8,$9,$5)',
 ['Demo Admin','admin@anacity.demo',hashA,'admin',c.id,'Saurabh Swain','resident@anacity.demo',hashR,'resident']);
 await pool.query(`INSERT INTO community_rules(community_id,config) VALUES($1,$2)`,
 [c.id,JSON.stringify({requiredFields:{move_in:['residentName','unitNumber','plannedDate','phone'],move_out:['residentName','unitNumber','plannedDate','phone']},documents:{move_in:['Government ID'],move_out:['Government ID']},noticeDays:{move_in:2,move_out:2},vehicleDetailsOptional:true})]);
 console.log('Seed complete. Admin: admin@anacity.demo / Admin123! | Resident: resident@anacity.demo / Resident123!');
}catch(e){console.error(e);process.exitCode=1;}finally{await pool.end();}
