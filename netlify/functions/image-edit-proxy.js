exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const imageEditApiUrl = process.env.IMAGE_EDIT_API_URL;
    const imageEditApiKey = process.env.IMAGE_EDIT_API_KEY || '';

    if (!imageEditApiUrl) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing IMAGE_EDIT_API_URL env. Perplexity is used for analysis, but actual pixel editing still needs an image edit API.' })
      };
    }

    const headers = { 'Content-Type': 'application/json' };
    if (imageEditApiKey) headers['Authorization'] = `Bearer ${imageEditApiKey}`;

    const resp = await fetch(imageEditApiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const data = await resp.json();

    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify({ error: data.error || 'Image edit API error', raw: data }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Unknown server error' }) };
  }
};
