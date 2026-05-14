import { Component } from "react";
export class SafePage extends Component {
  constructor(p){super(p);this.state={error:null};}
  static getDerivedStateFromError(e){return {error:e};}
  componentDidCatch(e,i){console.error("[SafePage]",this.props.title||"page",e,i?.componentStack);}
  reset=()=>this.setState({error:null});
  render(){const {error}=this.state;const {title,loading,fallback,children,empty,isEmpty}=this.props;
    if(error)return(<div style={{padding:24}}><div className="card p-6" style={{borderLeft:"4px solid #C62828"}}>
      <div style={{fontSize:18,fontWeight:700}}>💥 {title||"Page"} couldn't render</div>
      <p style={{fontSize:12,color:"#666",marginTop:6}}>The rest of the app is fine.</p>
      <pre style={{background:"#fafafa",padding:10,borderRadius:6,fontSize:11,color:"#666",overflowX:"auto",maxHeight:160}}>{String(error?.message||error)}</pre>
      <button onClick={this.reset} className="btn btn-primary" style={{marginTop:8}}>Try again</button>
    </div></div>);
    if(loading)return fallback||<div style={{padding:60,textAlign:"center",color:"#888"}}>Loading…</div>;
    if(isEmpty&&empty)return empty; return children;}}
export default SafePage;
