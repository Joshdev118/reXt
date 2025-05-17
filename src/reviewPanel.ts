import * as vscode from 'vscode';

export function showReviewPanel(errors: { message: string, line: number, column: number }[]) {
    const panel = vscode.window.createWebviewPanel(
        'codeReview',
        'Code Review',
        vscode.ViewColumn.Beside,
        {}
    );

    // Build HTML for the error table
    const errorRows = errors.map(
        err => `<tr>
            <td>${err.line}</td>
            <td>${err.column}</td>
            <td>${err.message}</td>
        </tr>`
    ).join('');

    panel.webview.html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: sans-serif; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #ccc; padding: 8px; }
                th { background: #383838; }
            </style>
        </head>
        <body>
            <h2>Code Errors</h2>
            <table>
                <thead>
                    <tr>
                        <th>Line</th>
                        <th>Column</th>
                        <th>Error</th>
                    </tr>
                </thead>
                <tbody>
                    ${errorRows}
                </tbody>
            </table>
        </body>
        </html>
    `;
}