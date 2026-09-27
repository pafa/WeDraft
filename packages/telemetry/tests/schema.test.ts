import {describe,it,expect} from 'vitest';
import {batchSchema,contentFeatures} from '../src/index.js';
const base={schema:1,id:crypto.randomUUID(),session:crypto.randomUUID(),article:crypto.randomUUID(),seq:1,version:'0.2.0',name:'content_input',properties:{method:'paste_html'}};
describe('privacy contract',()=>{
 it('rejects unknown article fields instead of silently accepting them',()=>{
   expect(batchSchema.safeParse({events:[base]}).success).toBe(true);
   for(const key of ['text','title','url','filename','html','clipboard','userAgent','ip']) {
     expect(batchSchema.safeParse({events:[{...base,[key]:'private'}]}).success).toBe(false);
     expect(batchSchema.safeParse({events:[{...base,properties:{...base.properties,[key]:'private'}}]}).success).toBe(false);
   }
 });
 it('rejects mixed sessions, unbounded batches and missing article context',()=>{
   expect(batchSchema.safeParse({events:[base,{...base,session:crypto.randomUUID()}]}).success).toBe(false);
   expect(batchSchema.safeParse({events:Array(21).fill(base)}).success).toBe(false);
   expect(batchSchema.safeParse({events:[{...base,article:null}]}).success).toBe(false);
 });
 it('reduces content to fixed buckets',()=>{
   expect(contentFeatures({title:'private title',blocks:[{type:'image'},{type:'image'},{type:'table'},{type:'heading'}]},'secret')).toEqual({chars:1,images:2,tables:1,headings:true,lists:false,quotes:false,code:false});
 });
});
