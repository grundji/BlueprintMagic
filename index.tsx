/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import {GoogleGenAI, Type} from '@google/genai';
import {BlueprintData, ChatState, marked, Playground} from './playground';

const SYSTEM_INSTRUCTIONS = `You are an expert Unreal Engine developer specializing in Blueprints. Your task is to generate a flowchart representation of a Blueprint graph based on the user's description.
You must output a JSON object that follows a specific schema.
The JSON object should contain two main properties: "description" and "graph".

- **description**: A brief, human-readable explanation of the blueprint's logic.
- **graph**: An object containing "nodes" and "connections".
  - **nodes**: An array of objects, where each object represents a Blueprint node.
    - \`id\`: A unique string identifier for the node (e.g., "node_1", "node_2").
    - \`label\`: The display text of the node (e.g., "Event BeginPlay", "Print String").
    - \`type\`: The category of the node. Use one of: "event", "function", "variable", "flow_control", "macro".
    - \`x\`: The horizontal position of the node in the graph.
    - \`y\`: The vertical position of the node in the graph.
    - \`inputs\`: An array of strings representing the names of input pins (e.g., ["In Exec", "In String"]).
    - \`outputs\`: An array of strings representing the names of output pins (e.g., ["Out Exec", "Return Value"]).
  - **connections**: An array of objects representing a connection between two nodes.
    - \`from\`: The \`id\` of the source node.
    - \`to\`: The \`id\` of the target node.
    - \`fromPort\`: The name of the output port on the source node.
    - \`toPort\`: The name of the input port on the target node.
    - \`type\`: The type of connection, either "exec" for execution flow (white wire) or "data" for data flow (colored wire).

Arrange the nodes logically in a left-to-right flow. Start event nodes at x=50. Increment x for subsequent connected nodes by about 300-400 units. Use the \`y\` coordinate to avoid overlaps. Ensure all connection ports you define exist in the corresponding node's \`inputs\` or \`outputs\` array. Do not add any text outside of the JSON object.`;

const BLUEPRINT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    description: {
      type: Type.STRING,
      description: "A brief, human-readable explanation of the blueprint's logic.",
    },
    graph: {
      type: Type.OBJECT,
      properties: {
        nodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: {type: Type.STRING},
              label: {type: Type.STRING},
              type: {
                type: Type.STRING,
                enum: ['event', 'function', 'variable', 'flow_control', 'macro'],
              },
              x: {type: Type.NUMBER},
              y: {type: Type.NUMBER},
              inputs: {type: Type.ARRAY, items: {type: Type.STRING}},
              outputs: {type: Type.ARRAY, items: {type: Type.STRING}},
            },
            required: ['id', 'label', 'type', 'x', 'y', 'inputs', 'outputs'],
          },
        },
        connections: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              from: {type: Type.STRING},
              to: {type: Type.STRING},
              fromPort: {type: Type.STRING},
              toPort: {type: Type.STRING},
              type: {type: Type.STRING, enum: ['exec', 'data']},
            },
            required: ['from', 'to', 'fromPort', 'toPort', 'type'],
          },
        },
      },
      required: ['nodes', 'connections'],
    },
  },
  required: ['description', 'graph'],
};

const EMPTY_BLUEPRINT: {description: string; graph: BlueprintData} = {
  description: 'An empty blueprint graph.',
  graph: {
    nodes: [],
    connections: [],
  },
};

const STARTUP_BLUEPRINT: {description: string; graph: BlueprintData} = {
  description:
    'This blueprint outlines a "Mage Dice" system. It initializes a 6-sided die where each face determines the number of fireballs to cast. It includes custom events to roll the dice and cast spells, to apply a random upgrade to a dice face, and to upgrade player health.',
  graph: {
    nodes: [
      {
        id: 'node_begin_play',
        label: 'Event BeginPlay',
        type: 'event',
        x: 50,
        y: 100,
        inputs: [],
        outputs: ['Exec'],
      },
      {
        id: 'node_set_dice_array',
        label: 'Set MageDiceFaces',
        type: 'variable',
        x: 300,
        y: 100,
        inputs: ['Exec', 'MageDiceFaces'],
        outputs: ['Exec'],
      },
      {
        id: 'node_dice_array_default',
        label: 'Make Array',
        type: 'function',
        x: 50,
        y: 175,
        inputs: ['[0]', '[1]', '[2]', '[3]', '[4]', '[5]'],
        outputs: ['Array'],
      },
      {
        id: 'node_roll_event',
        label: 'Custom Event: RollAndCast',
        type: 'event',
        x: 50,
        y: 350,
        inputs: [],
        outputs: ['Exec'],
      },
      {
        id: 'node_get_dice_array',
        label: 'Get MageDiceFaces',
        type: 'variable',
        x: 300,
        y: 425,
        inputs: [],
        outputs: ['MageDiceFaces'],
      },
      {
        id: 'node_random_int',
        label: 'Random Integer in Range',
        type: 'function',
        x: 300,
        y: 500,
        inputs: ['Min', 'Max'],
        outputs: ['Return Value'],
      },
      {
        id: 'node_get_from_array',
        label: 'Get (a copy)',
        type: 'function',
        x: 500,
        y: 425,
        inputs: ['Array', 'Index'],
        outputs: ['Value'],
      },
      {
        id: 'node_for_loop',
        label: 'For Loop',
        type: 'flow_control',
        x: 750,
        y: 350,
        inputs: ['Exec', 'First Index', 'Last Index'],
        outputs: ['Loop Body', 'Completed'],
      },
      {
        id: 'node_print_cast',
        label: 'Print String',
        type: 'function',
        x: 1000,
        y: 350,
        inputs: ['Exec', 'In String'],
        outputs: ['Exec'],
      },
      {
        id: 'node_upgrade_event',
        label: 'Custom Event: ApplyRandomUpgrade',
        type: 'event',
        x: 50,
        y: 650,
        inputs: [],
        outputs: ['Exec'],
      },
      {
        id: 'node_get_dice_array_2',
        label: 'Get MageDiceFaces',
        type: 'variable',
        x: 300,
        y: 725,
        inputs: [],
        outputs: ['MageDiceFaces'],
      },
      {
        id: 'node_random_int_2',
        label: 'Random Integer in Range',
        type: 'function',
        x: 300,
        y: 800,
        inputs: ['Min', 'Max'],
        outputs: ['Return Value'],
      },
      {
        id: 'node_add_one',
        label: '+ (Integer)',
        type: 'function',
        x: 750,
        y: 725,
        inputs: ['', ''],
        outputs: ['Value'],
      },
      {
        id: 'node_set_array_elem',
        label: 'Set Array Elem',
        type: 'function',
        x: 1000,
        y: 650,
        inputs: ['Exec', 'Target Array', 'Index', 'Item'],
        outputs: ['Exec'],
      },
      {
        id: 'node_get_from_array_2',
        label: 'Get (a copy)',
        type: 'function',
        x: 500,
        y: 725,
        inputs: ['Array', 'Index'],
        outputs: ['Value'],
      },
      {
        id: 'node_hp_upgrade_event',
        label: 'Custom Event: UpgradeHealth',
        type: 'event',
        x: 50,
        y: 950,
        inputs: [],
        outputs: ['Exec'],
      },
      {
        id: 'node_get_max_hp',
        label: 'Get MaxHP',
        type: 'variable',
        x: 300,
        y: 1025,
        inputs: [],
        outputs: ['Value'],
      },
      {
        id: 'node_multiply_hp',
        label: '* (Float)',
        type: 'function',
        x: 500,
        y: 950,
        inputs: ['', ''],
        outputs: ['Value'],
      },
      {
        id: 'node_set_max_hp',
        label: 'Set MaxHP',
        type: 'variable',
        x: 750,
        y: 950,
        inputs: ['Exec', 'Value'],
        outputs: ['Exec'],
      },
    ],
    connections: [
      {from: 'node_begin_play', to: 'node_set_dice_array', fromPort: 'Exec', toPort: 'Exec', type: 'exec'},
      {from: 'node_dice_array_default', to: 'node_set_dice_array', fromPort: 'Array', toPort: 'MageDiceFaces', type: 'data'},
      {from: 'node_roll_event', to: 'node_for_loop', fromPort: 'Exec', toPort: 'Exec', type: 'exec'},
      {from: 'node_get_dice_array', to: 'node_get_from_array', fromPort: 'MageDiceFaces', toPort: 'Array', type: 'data'},
      {from: 'node_random_int', to: 'node_get_from_array', fromPort: 'Return Value', toPort: 'Index', type: 'data'},
      {from: 'node_get_from_array', to: 'node_for_loop', fromPort: 'Value', toPort: 'Last Index', type: 'data'},
      {from: 'node_for_loop', to: 'node_print_cast', fromPort: 'Loop Body', toPort: 'Exec', type: 'exec'},
      {from: 'node_upgrade_event', to: 'node_set_array_elem', fromPort: 'Exec', toPort: 'Exec', type: 'exec'},
      {from: 'node_get_dice_array_2', to: 'node_set_array_elem', fromPort: 'MageDiceFaces', toPort: 'Target Array', type: 'data'},
      {from: 'node_get_dice_array_2', to: 'node_get_from_array_2', fromPort: 'MageDiceFaces', toPort: 'Array', type: 'data'},
      {from: 'node_random_int_2', to: 'node_set_array_elem', fromPort: 'Return Value', toPort: 'Index', type: 'data'},
      {from: 'node_random_int_2', to: 'node_get_from_array_2', fromPort: 'Return Value', toPort: 'Index', type: 'data'},
      {from: 'node_get_from_array_2', to: 'node_add_one', fromPort: 'Value', toPort: '', type: 'data'},
      {from: 'node_add_one', to: 'node_set_array_elem', fromPort: 'Value', toPort: 'Item', type: 'data'},
      {from: 'node_hp_upgrade_event', to: 'node_set_max_hp', fromPort: 'Exec', toPort: 'Exec', type: 'exec'},
      {from: 'node_get_max_hp', to: 'node_multiply_hp', fromPort: 'Value', toPort: '', type: 'data'},
      {from: 'node_multiply_hp', to: 'node_set_max_hp', fromPort: 'Value', toPort: 'Value', type: 'data'},
    ],
  },
};

const EXAMPLE_PROMPTS = [
  'Show how to roll the dice and cast the spells',
  'Create a function that applies a "Rare" upgrade to the dice',
  'How would I add a mana cost to the RollAndCast event?',
  'Add logic to check if a dice roll is a critical success',
  'Make a new function to decrease player health and check if they have died.',
];

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

function createAiChat() {
  return ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: SYSTEM_INSTRUCTIONS,
      responseMimeType: 'application/json',
      responseSchema: BLUEPRINT_SCHEMA,
    },
  });
}

let aiChat = createAiChat();

document.addEventListener('DOMContentLoaded', async (event) => {
  const rootElement = document.querySelector('#root')! as HTMLElement;

  const playground = new Playground();
  rootElement.appendChild(playground);

  playground.sendMessageHandler = async (
    input: string,
    role: string,
    blueprintJson: string,
    dataHasChanged: boolean,
  ) => {
    const {thinking, text} = playground.addMessage('assistant', '');
    const message = [];

    if (role.toUpperCase() === 'USER' && dataHasChanged) {
      message.push({
        role: 'user',
        text: 'I have updated the blueprint JSON: ' + blueprintJson,
      });
    }

    // For now, system prompts are disabled as there is no runtime.
    // This can be re-enabled if we add blueprint validation.
    if (role.toUpperCase() === 'SYSTEM') {
      return;
    } else {
      message.push({
        role,
        text: input,
      });
    }

    playground.setChatState(ChatState.GENERATING);
    text.innerHTML = '...';

    let fullResponseText = '';

    try {
      const res = await aiChat.sendMessageStream({message});
      playground.setChatState(ChatState.CODING);

      for await (const chunk of res) {
        // No thinking display for this app, just stream the final result
        fullResponseText += chunk.text;
        text.innerHTML = 'Generating blueprint...';
      }

      const responseJson = JSON.parse(fullResponseText);
      if (responseJson.description && responseJson.graph) {
        text.innerHTML = await marked.parse(responseJson.description);
        playground.setBlueprintData(responseJson.graph);
      } else {
        throw new Error('Invalid JSON structure from API.');
      }
    } catch (e: any) {
      console.error('API Error or JSON Parsing Error:', e);
      let errorMessage = 'An error occurred. Please try again.';
      if (e instanceof Error) {
        errorMessage = e.message;
      } else if (typeof e === 'string') {
        errorMessage = e;
      }
      
      const {text: errorText} = playground.addMessage('error', '');
      errorText.innerHTML = `<strong>Error:</strong><br>${errorMessage}<br><br><strong>Received:</strong><pre>${fullResponseText}</pre>`;
    } finally {
      // close thinking block
      thinking.parentElement.classList.add('hidden');
      thinking.parentElement.removeAttribute('open');
      playground.setChatState(ChatState.IDLE);
      playground.scrollToTheEnd();
    }
  };

  playground.resetHandler = async () => {
    aiChat = createAiChat();
  };

  playground.setDefaultBlueprint(EMPTY_BLUEPRINT.graph);

  const initialPrompt =
    'This is a Mage Dice manager. Can you explain the "RollAndCast" event to me?';
  playground.addMessage('USER', initialPrompt);
  playground.setBlueprintData(STARTUP_BLUEPRINT.graph);
  playground.addMessage('ASSISTANT', STARTUP_BLUEPRINT.description);

  playground.setInputField(
    EXAMPLE_PROMPTS[Math.floor(Math.random() * EXAMPLE_PROMPTS.length)],
  );
});
