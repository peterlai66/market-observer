
export function calcHorizon(tradeDates:string[]):number{
  if(!tradeDates||tradeDates.length<2) return 0;
  return tradeDates.length-1;
}
