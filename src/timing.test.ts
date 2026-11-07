import { describe, expect, it } from 'vitest';
import { formatAverageMs, meanMs, summarizeResponseTimes } from './timing';
describe('有效响应时间', () => {
  it('真实0ms参与均值，空样本显示横线', () => {
    expect(formatAverageMs(summarizeResponseTimes([]))).toBe('—');
    expect(meanMs(summarizeResponseTimes([]))).toBeNull();
    const timing = summarizeResponseTimes([{ responseMs: 0 }, { responseMs: 501 }]);
    expect(timing).toEqual({ timedAnswers: 2, totalResponseMs: 501 });
    expect(formatAverageMs(timing)).toBe('251 ms');
    expect(meanMs(timing)).toBe(250.5);
  });
});
