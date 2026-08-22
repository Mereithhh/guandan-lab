import { describe,expect,it } from 'vitest';
import { parseCourseProgress,serializeCourseProgress,type CourseState } from '../../lib/services/course-progress';

const counts=[4,4,3,3];

describe('course progress persistence',()=>{
  it('round-trips evidence for completed and in-progress chapters',()=>{
    const state:CourseState={progress:[3,2,0,0],mastered:[true,false,false,false],mistakes:[1,2,0,0]};
    expect(parseCourseProgress(serializeCourseProgress(state),counts)).toEqual(state);
  });

  it('rejects stale, out-of-range, non-prefix and forged completion data',()=>{
    expect(parseCourseProgress('{"schemaVersion":0}',counts)).toBeNull();
    expect(parseCourseProgress(JSON.stringify({schemaVersion:1,progress:[4,0,0,0],mastered:[false,false,false,false],mistakes:[0,0,0,0]}),counts)).toBeNull();
    expect(parseCourseProgress(JSON.stringify({schemaVersion:1,progress:[0,0,2,0],mastered:[false,false,true,false],mistakes:[0,0,0,0]}),counts)).toBeNull();
    expect(parseCourseProgress(JSON.stringify({schemaVersion:1,progress:[2,0,0,0],mastered:[true,false,false,false],mistakes:[0,0,0,0]}),counts)).toBeNull();
    expect(parseCourseProgress('not-json',counts)).toBeNull();
  });
});
