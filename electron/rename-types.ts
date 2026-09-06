export type RenameOptions={start:number}
export type RenameFile={kind:'raw'|'jpeg';from:string;to:string;size:number;mtime:number}
export type RenameEntry={id:string;before:string;after:string;files:RenameFile[];error?:string}
export type RenamePreview={token:string;entries:RenameEntry[]}
