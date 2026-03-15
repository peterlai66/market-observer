
import assert from 'assert';

export function test_pipeline(run){
  const out=run();
  assert(out!=null);
}
