import type { ProviderId } from './types.ts'

export interface SampleTranscript {
  id: ProviderId
  provider: ProviderId
  label: string
  text: string
}

export const SAMPLES: readonly SampleTranscript[] = [
  {
    id: 'codex',
    provider: 'codex',
    label: 'Codex 示例',
    text: [
      '{"type":"session_meta","payload":{"id":"demo-codex","cwd":"/work/app"}}',
      '{"type":"event_msg","payload":{"type":"user_message","message":"登录有时会超时，请先复现再修好"}}',
      '{"type":"response_item","payload":{"type":"function_call","name":"shell","arguments":"{\\"command\\":\\"npm test\\"}"}}',
      '{"type":"response_item","payload":{"type":"function_call_output","output":"1 failed: login timeout"}}',
      '{"type":"event_msg","payload":{"type":"agent_message","message":"失败来自登录请求没有重试"}}',
    ].join('\n'),
  },
  {
    id: 'claude-code',
    provider: 'claude-code',
    label: 'Claude Code 示例',
    text: [
      '{"type":"user","message":{"role":"user","content":"看一下登录接口为什么会超时"}}',
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"先跑现有测试"},{"type":"tool_use","name":"Bash","input":{"command":"npm test"}}]}}',
      '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"1 failed: login timeout"}]}}',
    ].join('\n'),
  },
  {
    id: 'deepseek',
    provider: 'deepseek',
    label: 'DeepSeek 示例',
    text: [
      '{"role":"user","content":"解释这段登录超时"}',
      '{"role":"assistant","content":"我先读日志","tool_calls":[{"id":"c1","type":"function","function":{"name":"read_file","arguments":"{\\"path\\":\\"app.log\\"}"}}]}',
      '{"role":"tool","tool_call_id":"c1","content":"Error: timeout at login"}',
      '{"role":"assistant","content":"超时来自登录请求没有重试"}',
    ].join('\n'),
  },
  {
    id: 'kimi',
    provider: 'kimi',
    label: 'Kimi 示例',
    text: [
      '{"type":"kimi.session","title":"支付重试"}',
      '{"type":"kimi.step","name":"judge","thought":"先确认超时是不是网络抖动"}',
      '{"type":"kimi.step","name":"read","thought":"查看支付模块","action":{"tool":"read_file","input":"pay.ts"}}',
      '{"type":"kimi.step","name":"patch","thought":"补上三次重试","action":{"tool":"edit_file","input":"增加重试"}}',
      '{"type":"kimi.message","role":"assistant","content":"已补上三次重试"}',
    ].join('\n'),
  },
]

export function sampleById(id: ProviderId): SampleTranscript {
  const found = SAMPLES.find((sample) => sample.id === id)
  if (!found) throw new Error(`未知的 Agent：${id}`)
  return found
}
