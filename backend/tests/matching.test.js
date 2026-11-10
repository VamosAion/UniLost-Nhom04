import {matchingScore} from '../src/matching.js';
test('tính điểm cao khi bài mất và nhặt giống nhau',()=>{const a={type:'LOST',category:'Ví',location:'Thư viện',eventDate:'2026-10-01',colors:['đen'],title:'Mất ví đen',description:'ví sinh viên'};const b={...a,type:'FOUND'};expect(matchingScore(a,b)).toBeGreaterThanOrEqual(80);});
test('không ghép hai bài cùng loại',()=>expect(matchingScore({type:'LOST'},{type:'LOST'})).toBe(0));
