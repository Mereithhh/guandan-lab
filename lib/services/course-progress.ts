export type CourseState={progress:number[];mastered:boolean[];mistakes:number[]};

const SCHEMA_VERSION=1;

export function parseCourseProgress(raw:string|null,stepCounts:number[]):CourseState|null{
  if(!raw)return null;
  try{
    const value=JSON.parse(raw) as {schemaVersion?:unknown;progress?:unknown;mastered?:unknown;mistakes?:unknown};
    if(value.schemaVersion!==SCHEMA_VERSION||!Array.isArray(value.progress)||!Array.isArray(value.mastered)||!Array.isArray(value.mistakes))return null;
    if(value.progress.length!==stepCounts.length||value.mastered.length!==stepCounts.length||value.mistakes.length!==stepCounts.length)return null;
    const progress=value.progress as unknown[],mastered=value.mastered as unknown[],mistakes=value.mistakes as unknown[];
    if(progress.some((item,index)=>!Number.isInteger(item)||(item as number)<0||(item as number)>=stepCounts[index]))return null;
    if(mastered.some(item=>typeof item!=='boolean')||mistakes.some(item=>!Number.isInteger(item)||(item as number)<0||(item as number)>999))return null;
    let locked=false;
    for(let index=0;index<stepCounts.length;index++){
      if(locked&&(mastered[index]||progress[index]!==0||mistakes[index]!==0))return null;
      if(mastered[index]&&progress[index]!==stepCounts[index]-1)return null;
      if(!mastered[index])locked=true;
    }
    return {progress:progress as number[],mastered:mastered as boolean[],mistakes:mistakes as number[]};
  }catch{return null}
}

export function serializeCourseProgress(state:CourseState):string{return JSON.stringify({schemaVersion:SCHEMA_VERSION,...state})}
