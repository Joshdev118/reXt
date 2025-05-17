// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { showReviewPanel } from './reviewPanel';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

const ANNOTATION_PROMPT = `You are a code tutor who helps students in learning how to write better code. 
Your job is to evaluate a block of code that the user gives you and then annotate any lines that could be improved with a brief suggestion and the reason why you are making that suggestion. 
Only make suggestions when you feel the severity is enough that it will impact the readability and maintainability of the code. 
Be friendly with your suggestions and remember that these are students so they need gentle guidance. Format each suggestion as a single JSON object. 
It is not necessary to wrap your response in triple backticks. Here is an example of what your response should look like:

{ "line": 1, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is simpler and easier to read." }
{ "line": 12, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is simpler and easier to read." }
Other than that, please also scan for any errors and include them in your response with a brief explanation of what the error is and how to fix it.
`;

var lastResponse: vscode.TextEditorDecorationType | undefined;
var activeDecorations: vscode.TextEditorDecorationType[] = []; // Track all active decorations

let diagnostics = vscode.languages.createDiagnosticCollection("python"); // Create a new diagnostic collection for Python files



export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "rext" is now active!');



    const disposableAnnotate =                  ///////////////// Annotate Command  ///////////////////
    vscode.commands.registerTextEditorCommand('reXt.annotate', async (textEditor: vscode.TextEditor) => {

        lastResponse?.dispose();
        clearAllDecorations();

        const codeWithLineNumbers = getVisibleCodeWithLineNumbers(textEditor);

        // select the 4o chat model
        let [model] = await vscode.lm.selectChatModels({
            vendor: 'copilot',
            family: 'gpt-4o'
        });

        // init the chat message
        const messages = [
            vscode.LanguageModelChatMessage.User(ANNOTATION_PROMPT),
            vscode.LanguageModelChatMessage.User(codeWithLineNumbers)
        ];

          // make sure the model is available
        if (model) {
            // send the messages array to the model and get the response
            let chatResponse = await model.sendRequest(
              messages,
              {},
              new vscode.CancellationTokenSource().token
            );
  
            // handle chat response
            await parseChatResponse(chatResponse, textEditor);
            // lastResponse?.dispose();
       }

       
    });


    const disposableAIReview = vscode.commands.registerTextEditorCommand('reXt.showCodeReview', async (textEditor: vscode.TextEditor) => {
        clearAllDecorations();

        const codeWithLineNumbers = getVisibleCodeWithLineNumbers(textEditor);

        // AI prompt for error detection
        const ERROR_PROMPT = `You are a code reviewer. Scan the following code and return ONLY errors (not suggestions or style issues).
        You are also needed to return the errors in English and Malay language. Please remember to suggest a solution to the error.
        For each error, return a JSON object with "line", "column", and "message". Example:
        { "line": 3, "column": 10, "message": "SyntaxError: Unexpected indent ; SyntaxError: Inden tidak dijangka" }
        Return one JSON object per error, each on a new line.`;

        let [model] = await vscode.lm.selectChatModels({
            vendor: 'copilot',
            family: 'gpt-4o'
        });

        const messages = [
            vscode.LanguageModelChatMessage.User(ERROR_PROMPT),
            vscode.LanguageModelChatMessage.User(codeWithLineNumbers)
        ];

        if (model) {
            let chatResponse = await model.sendRequest(
                messages,
                {},
                new vscode.CancellationTokenSource().token
            );

            // Parse the AI response for error objects
            const errors: { line: number, column: number, message: string }[] = [];
            const errorSet = new Set<string>(); // To avoid duplicates
            let accumulated = '';
            for await (const fragment of chatResponse.text) {
                accumulated += fragment;
                // Try to extract JSON objects line by line
                const lines = accumulated.split('\n');
                for (const line of lines) {
                    try {
                        if (line.trim().startsWith('{')) {
                            const err = JSON.parse(line);
                            if (err.line && err.column && err.message) {
                                // Create a unique key for each error
                                const key = `${err.line}:${err.column}:${err.message}`;
                                if (!errorSet.has(key)) {
                                    errors.push(err);
                                    errorSet.add(key);
                                }
                            }
                        }
                    } catch { /* ignore parse errors */ }
                }
            }
            showReviewPanel(errors);
        }
    });



    const disposableClearAnnotate =               ////////////// Clear Annotations Command ////////////////
    vscode.commands.registerCommand('reXt.clearAnnotation', async () => {
        lastResponse?.dispose();
        clearAllDecorations();
    })


	context.subscriptions.push(disposableAnnotate);
    context.subscriptions.push(disposableAIReview);
    context.subscriptions.push(disposableClearAnnotate);
}


// -----------------------------------------------------------Functions----------------------------------------------------------------------------------------------------- //



//get visible code function 
function getVisibleCodeWithLineNumbers(textEditor: vscode.TextEditor) {

    console.log("Getting visible code...");

    // get the position of the first and last visible lines
    let currentLine = textEditor.visibleRanges[0].start.line;
    const endLine = textEditor.visibleRanges[0].end.line;
  
    let code = '';
  
    // get the text from the line at the current position.
    // The line number is 0-based, so we add 1 to it to make it 1-based.
    while (currentLine < endLine) {
      code += `${currentLine + 1}: ${textEditor.document.lineAt(currentLine).text} \n`;
      // move to the next line position
      currentLine++;
    }
    return code;
  }
  

async function parseChatResponse(
    chatResponse: vscode.LanguageModelChatResponse,
    textEditor: vscode.TextEditor
) {
    console.log("Generating response...");

    let accumulatedResponse = '';

    for await (const fragment of chatResponse.text) {
        accumulatedResponse += fragment;

        // Check if the accumulated response contains a complete JSON object
        const jsonEndIndex = accumulatedResponse.lastIndexOf('}');
        if (jsonEndIndex !== -1) {
            const potentialJson = accumulatedResponse.substring(0, jsonEndIndex + 1);
            try {
                const annotation = JSON.parse(potentialJson);
                const decoration = applyDecoration(textEditor, annotation.line, annotation.suggestion);
                activeDecorations.push(decoration); // Track the decoration

                // Remove the processed JSON from the accumulated response
                accumulatedResponse = accumulatedResponse.substring(jsonEndIndex + 1);
            } catch (e) {
                // If parsing fails, continue accumulating fragments
            }
        }
    }
}

function applyDecoration(editor: vscode.TextEditor, line: number, suggestion: string) {
    const decorationType = vscode.window.createTextEditorDecorationType({
        after: {
            contentText: ` ${suggestion.substring(0, 25) + '...'}`,
            color: 'grey'
        }
    });

    // Get the end of the line with the specified line number
    const lineLength = editor.document.lineAt(line - 1).text.length;
    const range = new vscode.Range(
        new vscode.Position(line - 1, lineLength),
        new vscode.Position(line - 1, lineLength)
    );

    const decoration = { range: range, hoverMessage: suggestion };

    vscode.window.activeTextEditor?.setDecorations(decorationType, [decoration]);

    return decorationType; // Return the decoration type for tracking
}

function clearAllDecorations() {
    for (const decoration of activeDecorations) {
        decoration.dispose();
    }
    activeDecorations = []; // Clear the array
}

// This method is called when your extension is deactivated
export function deactivate() {}
