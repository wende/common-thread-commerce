import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
export class AppServer extends EventEmitter {
  constructor({home,cwd,log}) {
    super();this.next=0;this.pending=new Map();
    this.child=spawn(process.env.CODEX_BIN||'codex',['app-server','--stdio'],{cwd,env:{...process.env,CODEX_HOME:home},stdio:['pipe','pipe','pipe']});
    this.child.stderr.on('data',data=>log({stderr:String(data)}));
    createInterface({input:this.child.stdout}).on('line',line=>{
      let message;try{message=JSON.parse(line);}catch{return;}
      log(message);
      if(message.method)this.emit('message',message);
      else if(this.pending.has(message.id)){const p=this.pending.get(message.id);this.pending.delete(message.id);clearTimeout(p.timer);message.error?p.reject(new Error(JSON.stringify(message.error))):p.resolve(message.result);}
    });
    this.child.on('error',error=>this.fail(error));
    this.child.on('exit',(code,signal)=>this.fail(new Error(`app-server exited: ${code}/${signal}`)));
  }
  fail(error){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();this.emit('closed',error);}
  send(message){this.child.stdin.write(JSON.stringify(message)+'\n');}
  request(method,params){return new Promise((resolve,reject)=>{const id=++this.next;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`RPC timeout: ${method}`));},60000);this.pending.set(id,{resolve,reject,timer});this.send({id,method,params});});}
  async init(){await this.request('initialize',{clientInfo:{name:'isolated_browser_benchmark',version:'1.0.0'},capabilities:{experimentalApi:true}});this.send({method:'initialized',params:{}});}
  stop(){this.child.stdin.end();this.child.kill('SIGTERM');}
}
