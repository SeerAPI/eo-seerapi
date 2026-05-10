import fs from 'fs';

const API_DATA_BASE_URL = process.env.OAD_URL;

function buildApiReference() {
    if (!API_DATA_BASE_URL) throw new Error('OAD_URL is not set');

    const API_REFERENCE_HTML = `<!doctype html>
    <html>

    <head>
    <title>SeerAPI 参考</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    </head>

    <body>
    <div id="app"></div>

    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
        Scalar.createApiReference('#app', {
        url: '${API_DATA_BASE_URL}',
        })
    </script>
    </body>

    </html>
    `
    fs.mkdirSync('build/docs/v1', { recursive: true });
    fs.writeFileSync('build/docs/v1/api_reference.html', API_REFERENCE_HTML);
    return API_REFERENCE_HTML;
}

buildApiReference();
