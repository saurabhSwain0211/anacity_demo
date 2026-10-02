import dotenv from 'dotenv';dotenv.config();
import {pool} from '../src/db.js';
const sql=`
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS communities(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS users(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN('resident','admin')),community_id UUID REFERENCES communities(id),created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS community_rules(community_id UUID PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,config JSONB NOT NULL DEFAULT '{}'::jsonb,updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS move_requests(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),resident_id UUID NOT NULL REFERENCES users(id),community_id UUID NOT NULL REFERENCES communities(id),type TEXT NOT NULL CHECK(type IN('move_in','move_out')),status TEXT NOT NULL DEFAULT 'draft',unit_number TEXT,planned_date DATE,details JSONB NOT NULL DEFAULT '{}'::jsonb,admin_note TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX IF NOT EXISTS move_requests_community_status_idx ON move_requests(community_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS move_requests_resident_idx ON move_requests(resident_id,created_at DESC);
CREATE TABLE IF NOT EXISTS documents(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),request_id UUID NOT NULL REFERENCES move_requests(id) ON DELETE CASCADE,uploaded_by UUID NOT NULL REFERENCES users(id),original_name TEXT NOT NULL,mime_type TEXT NOT NULL,storage_path TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS agent_messages(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),request_id UUID NOT NULL REFERENCES move_requests(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN('user','assistant')),content TEXT NOT NULL,tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,created_at TIMESTAMPTZ DEFAULT NOW());
`;
try{await pool.query(sql);console.log('Database schema initialized.');}catch(e){console.error(e);process.exitCode=1;}finally{await pool.end();}
