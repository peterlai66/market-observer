
import assert from 'assert';

export function test_horizon_logic(calc){
  const r=calc(['2026-03-13','2026-03-14']);
  assert(r>=1);
}
