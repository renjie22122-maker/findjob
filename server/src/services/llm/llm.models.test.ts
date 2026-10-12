import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLlmConfig } from '../settings.service.js';
import { listLlmModels, normalizeModelList } from './llm.client.js';

describe('模型列表解析（兼容多种上游返回结构）', () => {
  it('支持 OpenAI 风格 { data: [...] }、{ models: [...] } 与裸数组', () => {
    expect(normalizeModelList({ data: [{ id: 'b' }, { id: 'a' }] }).map((m) => m.id)).toEqual(['a', 'b']);
    expect(normalizeModelList({ models: [{ name: 'two' }, 'one'] }).map((m) => m.id)).toEqual(['one', 'two']);
    expect(normalizeModelList(['x']).map((m) => m.id)).toEqual(['x']);
  });

  it('去重、排序，并忽略非法条目', () => {
    const models = normalizeModelList({
      data: [{ id: 'dup' }, { id: 'dup', owned_by: 'vendor' }, { id: '   ' }, 42, null, { name: 1 }, { id: 'z' }],
    });
    expect(models.map((m) => m.id)).toEqual(['dup', 'z']);
    expect(models[0].ownedBy).toBe('vendor');
    expect(models[1].ownedBy).toBeNull();
  });

  it('无法识别时返回空数组而不是抛错', () => {
    expect(normalizeModelList(null)).toEqual([]);
    expect(normalizeModelList({ foo: 'bar' })).toEqual([]);
    expect(normalizeModelList('text')).toEqual([]);
  });
});

describe('获取可用模型列表', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // 还原为“无 Key”状态，避免影响同一进程内其他用例
    setLlmConfig({ baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat' });
  });

  it('使用已保存的 Key 调用 {baseUrl}/models，Key 只放请求头', async () => {
    setLlmConfig({ baseUrl: 'https://api.example.com/', apiKey: 'sk-stored', model: 'm1' });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'model-b' }, { id: 'model-a', owned_by: 'vendor' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await listLlmModels();
    expect(result.models.map((m) => m.id)).toEqual(['model-a', 'model-b']);
    expect(result.usedStoredKey).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/models'); // 结尾斜杠被规范化，避免出现 //models
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-stored' });
    expect(init.body).toBeUndefined(); // 凭据只走请求头，不放进 body
  });

  it('草稿地址与临时 Key 优先于已保存配置（便于先试后存）', async () => {
    setLlmConfig({ baseUrl: 'https://stored.example.com', apiKey: 'sk-stored', model: 'm1' });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: ['draft-model'] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await listLlmModels({ baseUrl: 'https://draft.example.com/', apiKey: 'sk-draft' });
    expect(result.usedStoredKey).toBe(false);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://draft.example.com/models');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-draft' });
  });

  it('缺少地址或 Key 时给出 400 提示，且不发出请求', async () => {
    setLlmConfig({ baseUrl: 'https://api.example.com', apiKey: '', model: 'm1' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(listLlmModels()).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    await expect(listLlmModels({ apiKey: '  ' })).rejects.toThrow(/API Key/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('上游不支持 /models（404）时抛出可读错误', async () => {
    setLlmConfig({ baseUrl: 'https://api.example.com', apiKey: 'sk-x', model: 'm1' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })));

    await expect(listLlmModels()).rejects.toThrow(/HTTP 404/);
  });

  it('上游返回空列表时明确报错，而不是静默给出空下拉框', async () => {
    setLlmConfig({ baseUrl: 'https://api.example.com', apiKey: 'sk-x', model: 'm1' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 })));

    await expect(listLlmModels()).rejects.toThrow(/空/);
  });
});
