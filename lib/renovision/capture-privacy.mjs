/** Evidence metadata policy. Never persist exact GPS or user-provided secrets in public fixtures. */
const privateKeys=new Set(["latitude","longitude","gps","geolocation","address","accessToken","authorization","password","apiKey","secret","rawExif"]);
export function sanitizeCaptureMetadata(input) {
 if(!input||typeof input!=="object"||Array.isArray(input)) return {valid:false,metadata:null,removed:[],errors:["metadata object required"]};
 const metadata={},removed=[];
 for(const [key,value] of Object.entries(input)) {
   if(privateKeys.has(key)||/token|secret|password|credential|gps|location|address|exif/i.test(key)) {removed.push(key);continue;}
   if(["captureId","propertyId","roomId","deviceModel","platform","capturedAt","coordinateFrame","calibrationStatus"].includes(key) && (typeof value==="string"||value===null)) metadata[key]=value;
 }
 return {valid:true,metadata,removed,errors:[]};
}
