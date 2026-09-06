export type ReleaseAsset={name?:string;browser_download_url?:string}
export type GithubRelease={tag_name?:string;assets?:ReleaseAsset[]}
const downloadRoot='https://github.com/DigitalDan68/Lucci-Photo-Select/releases/download/'
export function newerVersion(current:string,candidate:string){const values=(value:string)=>value.replace(/^v/i,'').split(/[.+-]/).slice(0,3).map(part=>Number.parseInt(part,10)||0),a=values(current),b=values(candidate);for(let i=0;i<3;i++){if(b[i]!==a[i])return b[i]>a[i]}return false}
export function macInstaller(release:GithubRelease){const asset=release.assets?.find(item=>item.name?.toLowerCase().endsWith('.dmg')),url=asset?.browser_download_url;return url?.startsWith(downloadRoot)?url:undefined}

