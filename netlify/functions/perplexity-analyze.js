export default async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { image, prompt = '', mode = 'cleanup-guidance', enforce_image_analysis = false } = await request.json();

    if (!image) {
      return new Response(JSON.stringify({ error: 'Missing image payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const apiKey = process.env.PPLX_API_KEY || process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing PPLX_API_KEY / PERPLEXITY_API_KEY' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const systemPrompt = [
      'You are a multimodal image-cleanup analysis assistant.',
      'You ARE able to inspect the uploaded image supplied in this request.',
      'Do not say you cannot see images, cannot analyze images, or that you are only a search assistant.',
      'Do not answer based on web search results.',
      'Do not recommend other platforms unless explicitly asked.',
      'Your job is to analyze the uploaded image for local cleanup or inpainting guidance.',
      'Return Traditional Chinese only.',
      'Output must contain exactly these three section headings:',
      '1. 需要修補的區域判斷',
      '2. 保留不變的元素',
      '3. 建議的修補指令'
    ].join(' ');

    const userPrompt = [
      '請直接根據本次請求附上的圖片進行分析。',
      enforce_image_analysis ? '這是強制圖片分析模式，不要回覆你無法查看圖片、不能分析圖片、或你是搜尋助手。' : '',
      mode === 'cleanup-guidance' ? '目標是協助圖片局部修補，不是一般描述。' : '請分析圖片內容。',
      '第三段必須輸出一段可直接用於圖片修補的完整指令。',
      '該指令必須明確要求：保留原圖主體、構圖、光線、色調，只修補指定區域，避免重畫整張圖。',
      '不要加入法律建議、不要談平台限制、不要做搜尋摘要。',
      prompt || '若圖片中有被遮擋、髒污、文字、水印、雜點或需要局部修補的區域，請指出最合理的修補方向。'
    ].filter(Boolean).join('\n\n');

    const payload = {
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: image } }
          ]
        }
      ],
      temperature: 0.2,
      max_tokens: 1200
    };

    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return new Response(JSON.stringify({
        error: data?.error?.message || 'Perplexity request failed',
        raw: data
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const text = String(data?.choices?.[0]?.message?.content || '').trim();
    const fallback = [
      '1. 需要修補的區域判斷',
      '未能穩定取得模型分析內容，請重試一次。',
      '',
      '2. 保留不變的元素',
      '保留原圖主體、構圖、光線與色調。',
      '',
      '3. 建議的修補指令',
      '請以原圖為基礎，只修補使用者標記的局部區域，保留主體、構圖、光線與色調，不要重畫整張圖。'
    ].join('\n');

    return new Response(JSON.stringify({
      ok: true,
      mode,
      result: text || fallback,
      raw: data
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Unexpected error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
