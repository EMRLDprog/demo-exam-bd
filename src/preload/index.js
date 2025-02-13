import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  getFamilyMembers: () => ipcRenderer.invoke('getFamilyMembers'),
  calculateBudgetRatio: (familyMemberId) => ipcRenderer.invoke('calculateBudgetRatio', familyMemberId),
  createFamilyMember: (member) => ipcRenderer.invoke('createFamilyMember', member),
  updateFamilyMember: (member) => ipcRenderer.invoke('updateFamilyMember', member),
});
