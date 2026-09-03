export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const payload = data?.message;
    const message =
      typeof payload === "string"
        ? payload
        : payload?.message ?? (Array.isArray(payload) ? payload.join("；") : "请求失败");
    throw new ApiError(response.status, message, payload?.code ?? data?.code);
  }
  return data as T;
}

export async function apiForm<T>(path: string, body: FormData): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { method: "POST", body, credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const payload = data?.message;
    const message = typeof payload === "string" ? payload : payload?.message ?? "上传失败";
    throw new ApiError(response.status, message, payload?.code ?? data?.code);
  }
  return data as T;
}
