import { GoogleGenerativeAI } from '@google/generative-ai';
import { query } from './db.js';
import { missingRequiredFields } from './policy.js';

async function getRules(communityId) {
  const result = await query(
    'SELECT config FROM community_rules WHERE community_id=$1',
    [communityId]
  );

  return result.rows[0]?.config ?? {};
}

export const agentTools = {
  async get_community_rules({ communityId }) {
    return await getRules(communityId);
  },

  async check_request_completeness({ requestId, communityId }) {
    const result = await query(
      'SELECT * FROM move_requests WHERE id=$1 AND community_id=$2',
      [requestId, communityId]
    );

    if (!result.rows[0]) {
      return { error: 'Request not found' };
    }

    const r = result.rows[0];

    const rules = await getRules(communityId);

    const missing = missingRequiredFields(
      {
        type: r.type,
        details: r.details
      },
      rules
    );

    return {
      complete: missing.length === 0,
      missingFields: missing
    };
  },

  async get_request_status({ requestId, userId, role }) {
    const result = await query(
      `SELECT 
        id,
        type,
        status,
        planned_date,
        unit_number,
        created_at
       FROM move_requests
       WHERE id=$1
       AND ($2::text = 'admin' OR resident_id=$3)`,
      [requestId, role, userId]
    );

    return (
      result.rows[0] ?? {
        error: 'Request not found or access denied'
      }
    );
  }
};

const functionDeclarations = [
  {
    name: 'get_community_rules',
    description:
      'Read configured move-in and move-out rules for the community.',
    parameters: {
      type: 'OBJECT',
      properties: {
        communityId: {
          type: 'STRING'
        }
      },
      required: ['communityId']
    }
  },

  {
    name: 'check_request_completeness',
    description:
      'Check required fields for an existing request. Never approve or reject.',
    parameters: {
      type: 'OBJECT',
      properties: {
        requestId: {
          type: 'STRING'
        },
        communityId: {
          type: 'STRING'
        }
      },
      required: ['requestId', 'communityId']
    }
  },

  {
    name: 'get_request_status',
    description:
      'Retrieve status of a request, enforcing resident ownership.',
    parameters: {
      type: 'OBJECT',
      properties: {
        requestId: {
          type: 'STRING'
        }
      },
      required: ['requestId']
    }
  }
];

export async function runAgent({
  message,
  user,
  requestId = null,
  history = []
}) {
  const apiKey = process.env.GEMINI_API_KEY;

  // ---------------------------------------------------------
  // FALLBACK MODE
  // ---------------------------------------------------------

  if (!apiKey) {
    return {
      reply: `I can help with your ${
        requestId
          ? 'existing request'
          : 'move-in or move-out request'
      }. ${
        message.toLowerCase().includes('status') && requestId
          ? 'Your request status is available in the request list.'
          : 'Please share your move type, unit number, planned date, resident name and phone. I will help identify missing information before submission.'
      }`,
      toolCalls: [],
      mode: 'fallback'
    };
  }

  // ---------------------------------------------------------
  // GEMINI INITIALIZATION
  // ---------------------------------------------------------

  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',

    tools: [
      {
        functionDeclarations
      }
    ],

    systemInstruction: {
      role: 'system',
      parts: [
        {
          text: `
You are ANACITY's move-in/move-out workflow assistant.

Help residents and admins understand the process,
gather missing information, and summarize requests.

Do not invent community rules.

Use tools when useful.

You MUST NOT approve, reject, or change request status.
Only an authorized admin can perform those actions.

Ask concise follow-up questions for missing details.

User role: ${user.role}
Community ID: ${user.communityId}
Request ID: ${requestId ?? 'none'}
`
        }
      ]
    }
  });

  // ---------------------------------------------------------
  // BUILD GEMINI CONTENT HISTORY
  // ---------------------------------------------------------

  const contents = [];

  for (const h of history.slice(-12)) {
    contents.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [
        {
          text: h.content
        }
      ]
    });
  }

  // Add current user message
  contents.push({
    role: 'user',
    parts: [
      {
        text: message
      }
    ]
  });

  // ---------------------------------------------------------
  // FIRST GEMINI CALL
  // ---------------------------------------------------------

  let result = await model.generateContent({
    contents
  });

  let response = result.response;

  const toolCalls = [];

  // ---------------------------------------------------------
  // HANDLE FUNCTION CALLS
  // ---------------------------------------------------------

  const calls = response.functionCalls?.() ?? [];

  if (calls.length > 0) {
    // IMPORTANT:
    // Add Gemini's model response containing the function call
    // to the conversation first.

    contents.push(response.candidates[0].content);

    const functionResponseParts = [];

    for (const call of calls) {
      const args = {
        ...call.args
      };

      // Add authenticated user information server-side.
      if (call.name !== 'get_community_rules') {
        args.userId = user.id;
        args.role = user.role;
      }

      if (args.communityId === undefined) {
        args.communityId = user.communityId;
      }

      let output;

      if (agentTools[call.name]) {
        output = await agentTools[call.name](args);
      } else {
        output = {
          error: 'Tool unavailable'
        };
      }

      toolCalls.push({
        name: call.name,
        args: call.args,
        output
      });

      // IMPORTANT:
      // Function result is sent as a USER message,
      // NOT role: "function".
      functionResponseParts.push({
        functionResponse: {
          name: call.name,
          response: {
            result: output
          }
        }
      });
    }

    contents.push({
      role: 'user',
      parts: functionResponseParts
    });

    // -------------------------------------------------------
    // SECOND GEMINI CALL
    // -------------------------------------------------------

    result = await model.generateContent({
      contents
    });

    response = result.response;
  }

  // ---------------------------------------------------------
  // FINAL RESPONSE
  // ---------------------------------------------------------

  return {
    reply: response.text(),
    toolCalls,
    mode: 'gemini'
  };
}