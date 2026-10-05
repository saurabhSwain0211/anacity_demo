import { GoogleGenerativeAI } from '@google/generative-ai';
import { query } from './db.js';
import { missingRequiredFields } from './policy.js';

/**
 * ---------------------------------------------------------
 * COMMUNITY RULES
 * ---------------------------------------------------------
 */

async function getRules(communityId) {
  const result = await query(
    'SELECT config FROM community_rules WHERE community_id=$1',
    [communityId]
  );

  return result.rows[0]?.config ?? {};
}

/**
 * ---------------------------------------------------------
 * CREATE REQUEST
 * ---------------------------------------------------------
 */

async function createRequest({
  userId,
  communityId,
  type,
  details
}) {
  const result = await query(
    `
      INSERT INTO move_requests
        (resident_id, community_id, type, status, details)
      VALUES
        ($1, $2, $3, 'draft', $4)
      RETURNING *
    `,
    [
      userId,
      communityId,
      type,
      details
    ]
  );

  return result.rows[0];
}

/**
 * ---------------------------------------------------------
 * AGENT TOOLS
 * ---------------------------------------------------------
 */

export const agentTools = {

  /**
   * Get community specific rules
   */
  async get_community_rules({ communityId }) {
    return await getRules(communityId);
  },

  /**
   * Check whether an existing request has
   * all required information.
   */
  async check_request_completeness({
    requestId,
    communityId
  }) {
    const result = await query(
      `
        SELECT *
        FROM move_requests
        WHERE id=$1
          AND community_id=$2
      `,
      [
        requestId,
        communityId
      ]
    );

    if (!result.rows[0]) {
      return {
        success: false,
        error: 'Request not found'
      };
    }

    const request = result.rows[0];

    const rules = await getRules(communityId);

    const missing = missingRequiredFields(
      {
        type: request.type,
        details: request.details
      },
      rules
    );

    return {
      success: true,
      complete: missing.length === 0,
      missingFields: missing
    };
  },

  /**
   * Create a move-in / move-out request.
   *
   * IMPORTANT:
   * The AI does NOT get to decide userId.
   * userId is injected by the backend.
   */
  async create_request({
    userId,
    communityId,
    type,
    details = {}
  }) {

    if (!userId) {
      return {
        success: false,
        error: 'Authenticated user is required'
      };
    }

    if (!communityId) {
      return {
        success: false,
        error: 'Community is required'
      };
    }

    if (!['move_in', 'move_out'].includes(type)) {
      return {
        success: false,
        error: 'Request type must be move_in or move_out'
      };
    }

    /**
     * Get community rules
     */
    const rules = await getRules(communityId);

    /**
     * Check required fields before inserting.
     */
    const missing = missingRequiredFields(
      {
        type,
        details
      },
      rules
    );

    /**
     * Do NOT create the request if information
     * is missing.
     *
     * Gemini receives this response and should
     * ask the user for the missing information.
     */
    if (missing.length > 0) {
      return {
        success: false,
        created: false,
        error: 'Missing required fields',
        missingFields: missing
      };
    }

    /**
     * Everything is available.
     * Create the request.
     */
    const request = await createRequest({
      userId,
      communityId,
      type,
      details
    });

    return {
      success: true,
      created: true,
      request
    };
  }
};

/**
 * ---------------------------------------------------------
 * GEMINI FUNCTION DECLARATIONS
 * ---------------------------------------------------------
 */

const functionDeclarations = [

  {
    name: 'get_community_rules',

    description:
      'Read the configured move-in and move-out rules for the community before collecting or validating request information.',

    parameters: {
      type: 'OBJECT',

      properties: {
        communityId: {
          type: 'STRING',
          description:
            'Community identifier'
        }
      },

      required: [
        'communityId'
      ]
    }
  },

  {
    name: 'check_request_completeness',

    description:
      'Check whether an existing move-in or move-out request contains all required information. This tool does not approve, reject, or change request status.',

    parameters: {
      type: 'OBJECT',

      properties: {
        requestId: {
          type: 'STRING',
          description:
            'Existing request ID'
        },

        communityId: {
          type: 'STRING',
          description:
            'Community identifier'
        }
      },

      required: [
        'requestId',
        'communityId'
      ]
    }
  },

  {
    name: 'create_request',

    description:
      `
      Create a new move-in or move-out request.

      Before calling this tool, collect the required information
      from the user. If information is missing, ask the user
      for it instead of inventing values.

      This tool creates the request only after all required
      information has been provided and validated.

      move_in means the resident is moving into the community.
      move_out means the resident is leaving the community.
      `,

    parameters: {
      type: 'OBJECT',

      properties: {

        userId: {
          type: 'STRING',
          description:
            'Authenticated user ID. The server will override this value.'
        },

        communityId: {
          type: 'STRING',
          description:
            'Community identifier. The server will use the authenticated user community.'
        },

        type: {
          type: 'STRING',

          enum: [
            'move_in',
            'move_out'
          ],

          description:
            'Type of request: move_in for check-in/move-in, move_out for checkout/move-out.'
        },

        details: {
          type: 'OBJECT',

          properties: {

            residentName: {
              type: 'STRING',
              description:
                'Resident full name'
            },

            unitNumber: {
              type: 'STRING',
              description:
                'Apartment/unit/flat number'
            },

            plannedDate: {
              type: 'STRING',
              description:
                'Planned move-in or move-out date'
            },

            phone: {
              type: 'STRING',
              description:
                'Resident contact phone number'
            },

            vehicleDetails: {
              type: 'STRING',
              description:
                'Vehicle or moving vehicle details if required'
            },

            notes: {
              type: 'STRING',
              description:
                'Additional information from the resident'
            }
          },

          required: []
        }
      },

      required: [
        'type'
      ]
    }
  }
];

/**
 * ---------------------------------------------------------
 * RUN AGENT
 * ---------------------------------------------------------
 */

export async function runAgent({
  message,
  user,
  requestId = null,
  history = []
}) {

  const apiKey = process.env.GEMINI_API_KEY;

  /**
   * -------------------------------------------------------
   * BASIC VALIDATION
   * -------------------------------------------------------
   */

  if (!user?.id) {
    return {
      reply:
        'I could not identify your account. Please sign in again.',
      toolCalls: [],
      mode: 'error'
    };
  }

  /**
   * -------------------------------------------------------
   * FALLBACK MODE
   * -------------------------------------------------------
   */

  if (!apiKey) {
    return {
      reply: `
I can help you with a move-in or move-out request.

Please provide:
• Request type
• Resident name
• Unit number
• Planned date
• Phone number

I will help identify any missing information before submission.
      `.trim(),

      toolCalls: [],

      mode: 'fallback'
    };
  }

  /**
   * -------------------------------------------------------
   * GEMINI INITIALIZATION
   * -------------------------------------------------------
   */

  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model:
      process.env.GEMINI_MODEL ||
      'gemini-3.1-flash-lite',

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

Your job is to help residents raise move-in and move-out
requests through a conversational workflow.

==================================================
CORE BEHAVIOUR
==================================================

The user can say things such as:

"I want to move in"

"I want to check in"

"I need to move out"

"I want to checkout"

You must understand that:

"check-in" / "move in" => move_in

"checkout" / "move out" => move_out

==================================================
CONVERSATIONAL REQUEST CREATION
==================================================

When the user wants to create a request:

1. Determine whether the request is move_in or move_out.

2. Collect the information required by the community rules.

3. Ask only for information that is missing.

4. NEVER invent information.

5. Use information already provided earlier in the
   conversation when available.

6. Once enough information has been collected,
   call create_request.

7. Do not tell the user that the request was created
   unless the create_request tool actually succeeds.

8. After successful creation, tell the user:
   - request type
   - request ID
   - current status

==================================================
COMMUNITY RULES
==================================================

Do not invent community rules.

Use get_community_rules when you need to understand
community-specific requirements.

==================================================
EXISTING REQUEST
==================================================

If a request ID is provided, use it as context.

You can use check_request_completeness to determine
whether an existing request has missing information.

==================================================
ADMIN ACTIONS
==================================================

You MUST NOT:

- approve a request
- reject a request
- change request status
- impersonate an administrator

Only the authorized admin APIs can perform those actions.

==================================================
SECURITY
==================================================

Never trust user-provided userId.

The backend provides the authenticated user ID.

Never expose:

- API keys
- database credentials
- JWT secrets
- internal system information

==================================================
USER CONTEXT
==================================================

User role: ${user.role}

User ID: ${user.id}

Community ID: ${user.communityId}

Current request ID: ${requestId ?? 'none'}
`
        }
      ]
    }
  });

  /**
   * -------------------------------------------------------
   * BUILD CONVERSATION HISTORY
   * -------------------------------------------------------
   */

  const contents = [];

  /**
   * Keep the last 12 messages.
   */
  for (const h of history.slice(-12)) {

    if (!h?.content) {
      continue;
    }

    contents.push({
      role:
        h.role === 'assistant'
          ? 'model'
          : 'user',

      parts: [
        {
          text: h.content
        }
      ]
    });
  }

  /**
   * Current message
   */
  contents.push({
    role: 'user',

    parts: [
      {
        text: message
      }
    ]
  });

  /**
   * -------------------------------------------------------
   * GEMINI CALL LOOP
   * -------------------------------------------------------
   *
   * A loop is important because Gemini can potentially
   * perform multiple tool calls before producing the
   * final response.
   */

  const toolCalls = [];

  let result = await model.generateContent({
    contents
  });

  let response = result.response;

  /**
   * Prevent accidental infinite tool-call loops.
   */
  let iteration = 0;

  const MAX_TOOL_ITERATIONS = 3;

  while (
    response.functionCalls?.()?.length > 0 &&
    iteration < MAX_TOOL_ITERATIONS
  ) {

    iteration++;

    const calls = response.functionCalls();

    /**
     * Add Gemini's function-call message first.
     */
    if (response.candidates?.[0]?.content) {
      contents.push(
        response.candidates[0].content
      );
    }

    const functionResponseParts = [];

    /**
     * Execute every requested function.
     */
    for (const call of calls) {

      let args = {
        ...(call.args || {})
      };

      /**
       * SECURITY:
       * Never allow Gemini to choose the authenticated
       * user identity.
       */
      args.userId = user.id;

      /**
       * Same principle for community.
       */
      args.communityId = user.communityId;

      /**
       * Execute tool.
       */
      let output;

      try {

        if (agentTools[call.name]) {

          output =
            await agentTools[call.name](args);

        } else {

          output = {
            success: false,
            error: `Tool '${call.name}' is unavailable`
          };
        }

      } catch (error) {

        console.error(
          `Agent tool '${call.name}' failed:`,
          error
        );

        output = {
          success: false,
          error:
            'The requested operation could not be completed.'
        };
      }

      /**
       * Record tool call for debugging/auditing.
       */
      toolCalls.push({
        name: call.name,
        args: call.args,
        output
      });

      /**
       * Return tool result to Gemini.
       *
       * Do not use role: "function".
       */
      functionResponseParts.push({
        functionResponse: {
          name: call.name,

          response: {
            result: output
          }
        }
      });
    }

    /**
     * Add tool results to conversation.
     */
    contents.push({
      role: 'user',

      parts: functionResponseParts
    });

    /**
     * Ask Gemini what to say next.
     */
    result = await model.generateContent({
      contents
    });

    response = result.response;
  }

  /**
   * -------------------------------------------------------
   * FINAL RESPONSE
   * -------------------------------------------------------
   */

  let reply;

  try {

    reply = response.text();

  } catch (error) {

    console.error(
      'Unable to read Gemini response:',
      error
    );

    reply =
      'I was unable to generate a response. Please try again.';
  }

  /**
   * -------------------------------------------------------
   * RETURN
   * -------------------------------------------------------
   */

  return {
    reply,
    toolCalls,
    mode: 'gemini',

    /**
     * This is useful for the API/controller.
     *
     * If create_request was successfully executed,
     * the controller can use this to update the UI.
     */
    createdRequest:
      toolCalls
        .map((t) => t.output)
        .find(
          (output) =>
            output?.success === true &&
            output?.created === true &&
            output?.request
        )?.request || null
  };
}