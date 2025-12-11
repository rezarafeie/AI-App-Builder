import React, { useState, useEffect } from 'react';
import { Project, User, Collaborator, CollaboratorRole } from '../types';
import { useTranslation } from '../utils/translations';
import { cloudService } from '../services/cloudService';
import { Globe, Users, Copy, ExternalLink, Star, ChevronDown, Check, X, Loader2, Shield } from 'lucide-react';

interface PublishDropdownProps {
  project: Project;
  user: User;
  onManageDomains: () => void;
  onClose: () => void;
  onUpdate: () => void;
}

const PublishDropdown: React.FC<PublishDropdownProps> = ({ project, user, onManageDomains, onClose, onUpdate }) => {
    const { t } = useTranslation();
    const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<CollaboratorRole>('viewer');

    const platformDomain = `rafieibuilder.lovable.app`; // Placeholder
    const projectUrl = project.customDomain || `${project.name.toLowerCase().replace(/\s+/g, '-')}.novabuilder.app`;

    const fetchCollaborators = async () => {
        setIsLoading(true);
        try {
            const fetched = await cloudService.getCollaborators(project.id);
            // Manually add owner to the list for UI purposes
            if (project.owner) {
                const ownerAsCollaborator: Collaborator = {
                    id: project.owner.id,
                    email: project.owner.email,
                    avatar: project.owner.avatar,
                    role: 'owner',
                    projectId: project.id
                };
                // Avoid duplicates if owner is also in collaborators table
                if (!fetched.some(c => c.id === ownerAsCollaborator.id)) {
                     setCollaborators([ownerAsCollaborator, ...fetched]);
                } else {
                     setCollaborators(fetched.map(c => c.id === ownerAsCollaborator.id ? ownerAsCollaborator : c ));
                }
            } else {
                setCollaborators(fetched);
            }
        } catch (error) {
            console.error("Failed to fetch collaborators", error);
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        fetchCollaborators();
    }, [project.id]);

    const handleAddCollaborator = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!inviteEmail) return;
        try {
            await cloudService.addCollaborator(project.id, inviteEmail, inviteRole);
            setInviteEmail('');
            fetchCollaborators(); // Refresh list
        } catch(error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const handleRemoveCollaborator = async (userId: string) => {
        if(!window.confirm("Are you sure you want to remove this user's access?")) return;
        try {
            await cloudService.removeCollaborator(project.id, userId);
            fetchCollaborators(); // Refresh list
        } catch(error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    return (
        <div className="w-[90vw] max-w-[24rem] md:w-96 bg-[#1e293b] border border-gray-700 rounded-2xl shadow-2xl text-white p-4 animate-in fade-in slide-in-from-top-2 duration-200" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">Publish
                    {project.publishedUrl && <span className="text-xs font-medium bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full border border-green-500/30">{t('live')}</span>}
                </h3>
                <div className="text-xs text-gray-400 flex items-center gap-1.5"><Users size={14} /> 7 {t('visitors')}</div>
            </div>

            {/* Platform Domain */}
            <div className="bg-slate-800/50 border border-gray-700/80 rounded-lg p-2 flex items-center justify-between mb-4">
                <input type="text" readOnly value={projectUrl} className="bg-transparent text-sm w-full outline-none" />
                <button className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"><Copy size={14} /></button>
            </div>

            {/* Custom Domain Section */}
            <div className="space-y-3 mb-4">
                <div className="flex items-center gap-3">
                    <Globe size={16} className="text-gray-400" />
                    <span className="text-sm font-semibold">{project.customDomain || 'build.rafiei.co'}</span>
                    <Star size={14} className="text-yellow-400 fill-current" />
                    <a href={`https://${project.customDomain || 'build.rafiei.co'}`} target="_blank" rel="noopener noreferrer" className="ml-auto text-gray-500 hover:text-white"><ExternalLink size={16}/></a>
                </div>
                <div className="flex gap-2 text-sm">
                    <button className="bg-slate-700/50 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-md flex-1">{t('editDomain')}</button>
                    <button onClick={onManageDomains} className="bg-slate-700/50 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-md flex-1">{t('manageDomains')}</button>
                </div>
            </div>
            
            <div className="h-px bg-gray-700 my-4"></div>

            {/* Collaboration Section */}
            <div>
                <div className="flex items-center gap-3 mb-3">
                    <Users size={16} className="text-gray-400" />
                    <span className="text-sm font-semibold">{t('whoCanAccess')}</span>
                </div>
                <div className="space-y-2 mb-3 max-h-40 overflow-y-auto pr-1">
                    {isLoading ? <Loader2 className="animate-spin text-gray-500"/> : collaborators.map(c => (
                        <div key={c.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                                <img src={c.avatar} alt={c.email} className="w-7 h-7 rounded-full" />
                                <div>
                                    <p className="font-medium text-slate-200">{c.email}</p>
                                    <p className="text-xs text-slate-500 capitalize">{c.role}</p>
                                </div>
                            </div>
                            {c.role !== 'owner' && project.owner?.id === user.id && (
                                <button onClick={() => handleRemoveCollaborator(c.id)} className="text-gray-500 hover:text-red-400 p-1"><X size={14}/></button>
                            )}
                        </div>
                    ))}
                </div>
                {project.owner?.id === user.id && (
                <form onSubmit={handleAddCollaborator} className="flex items-center gap-2">
                    <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Invite with email..." className="flex-1 bg-slate-800/50 border border-gray-700 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                    <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3 py-1.5 rounded-md text-sm">Invite</button>
                </form>
                )}
            </div>

            <div className="h-px bg-gray-700 my-4"></div>

            {/* Security Scan */}
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <Shield size={16} className="text-gray-400" />
                    <span className="text-sm font-semibold">{t('securityScan')}</span>
                    <div className="ml-auto flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">2 Errors <ExternalLink size={14}/></div>
                </div>
                <div className="flex gap-2 text-sm">
                    <button className="bg-slate-700/50 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-md flex-1">{t('reviewSecurity')}</button>
                    <button className="bg-indigo-600/80 hover:bg-indigo-600 text-white font-semibold px-3 py-1.5 rounded-md flex-1">{t('updated')}</button>
                </div>
            </div>

        </div>
    );
};

export default PublishDropdown;