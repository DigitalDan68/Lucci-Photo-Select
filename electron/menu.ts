import type {MenuItemConstructorOptions} from 'electron'
export function menuTemplate(platform:string,send:(action:string)=>void):MenuItemConstructorOptions[]{
 const item=(label:string,action:string,accelerator?:string):MenuItemConstructorOptions=>({label,accelerator,click:()=>send(action)})
 return [...(platform==='darwin'?[{role:'appMenu' as const}]:[]),{label:'File',submenu:[item('New catalog…','new','CmdOrCtrl+N'),item('Open project…','open','CmdOrCtrl+O'),item('Save LPV…','save','CmdOrCtrl+S'),item('Import photos…','import','CmdOrCtrl+I'),item('Export picks…','export','CmdOrCtrl+E'),{type:'separator'},item('Rename photos…','rename','F2'),{type:'separator'},{role:'close'}]},
 {label:'Edit',submenu:[item('Undo','undo','CmdOrCtrl+Z'),item('Redo','redo','CmdOrCtrl+Shift+Z'),{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'},item('Deselect All','deselect','CmdOrCtrl+Shift+A')]},
 {label:'View',submenu:[item('Preview / thumbnails','preview','F3'),item('Fit image','fit'),item('100% pixels','actual'),item('Keyboard shortcuts','shortcuts'),{type:'separator'},{role:'togglefullscreen'}]},{label:'Help',submenu:[item('Check for updates…','check-updates')]},{role:'windowMenu'}]
}
