import {AbsoluteFill,Composition,registerRoot} from "remotion";
function AccountPreview({topic}:{topic:string}) {
  if(typeof topic !== "string" || topic.length>200)throw new Error("INVALID_PREVIEW");
  return <AbsoluteFill style={{backgroundColor:"#0A0B0D",color:"#F3F4F6",padding:100,justifyContent:"center",fontFamily:"Arial, sans-serif"}}>
    <div style={{color:"#13EF93",fontSize:24,marginBottom:24}}>AssemblyReel · Project preview</div>
    <div style={{fontSize:50,lineHeight:1.25,overflowWrap:"anywhere"}}>{topic}</div>
  </AbsoluteFill>;
}
function AccountPreviewRoot(){return <Composition id="AccountPreviewV1" component={AccountPreview} durationInFrames={150} fps={30} width={1280} height={720} defaultProps={{topic:"Project preview"}}/>;}
registerRoot(AccountPreviewRoot);
