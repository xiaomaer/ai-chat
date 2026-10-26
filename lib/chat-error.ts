import { APICallError } from 'ai';

export function chatErrorMessage(error: unknown): string {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) return '当前模型的调用额度已用完或请求过于频繁，请稍后重试。';
    if (error.statusCode === 401 || error.statusCode === 403) return '模型服务拒绝了请求，请检查 API Key、账号权限和地区支持情况。';
    if (error.statusCode === 404) return '当前模型暂不可用，请检查模型名称和账号权限。';
  }
  return '暂时无法连接模型服务，请检查网络后重试。';
}
