
import assert from 'assert';

export function test_report_output(sampleReport){
  assert(sampleReport.includes('Market Operator Report'));
}
