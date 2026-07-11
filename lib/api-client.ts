export type ApiErrorBody = {
  error?: { code?: string; message?: string; details?: unknown };
};

export async function readApiJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    const error = new Error(data.error?.message ?? `请求失败（${response.status}）`);
    Object.assign(error, { code: data.error?.code, status: response.status });
    throw error;
  }
  return data;
}
