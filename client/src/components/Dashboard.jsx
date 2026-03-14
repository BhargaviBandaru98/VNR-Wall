import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Building2, GraduationCap, ShieldCheck, Activity, Search, ShieldAlert, ArrowRight } from 'lucide-react';
import axios from 'axios';
import DiagnosticModal from './DiagnosticModal';
import '../styles/Dashboard.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:6105';

const Dashboard = () => {
    const { user } = useAuth();
    const [stats, setStats] = useState({
        totalInvestigations: 0,
        scamsAvoided: 0,
        recentActivity: []
    });
    const [loading, setLoading] = useState(true);
    const [selectedResult, setSelectedResult] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        const fetchStats = async () => {
            if (!user?.email) return;
            try {
                const response = await axios.get(`${BACKEND_URL}/api/user-stats/${user.email}`);
                setStats(response.data);
            } catch (error) {
                console.error("Failed to fetch dashboard stats", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [user]);

    const openModal = (data) => {
        setSelectedResult(data);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
    };

    if (loading) {
        return (
            <div className="dashboard-loading">
                <div className="spinner"></div>
                <p>Loading your Safety Impact...</p>
            </div>
        );
    }

    return (
        <div className="dashboard-container wrapper">
            {/* Header & Badges */}
            <header className="dashboard-header glass-card">
                <div className="user-info">
                    <h1>Welcome back, <span>{user?.name?.split(' ')[0]}</span></h1>
                    <p className="subtitle">Your VerifyWall Intelligence Hub</p>
                </div>
                <div className="user-badges">
                    {user?.college_name && (
                        <div className="badge">
                            <Building2 size={18} />
                            <span>{user.college_name}</span>
                        </div>
                    )}
                    {user?.year_of_study && (
                        <div className="badge">
                            <GraduationCap size={18} />
                            <span>Class of {user.year_of_study}</span>
                        </div>
                    )}
                </div>
            </header>

            {/* Safety Impact Stats */}
            <section className="dashboard-stats">
                <div className="stat-card glass-card">
                    <div className="stat-icon search-icon">
                        <Search size={28} />
                    </div>
                    <div className="stat-info">
                        <h3>Investigations Run</h3>
                        <p className="stat-value">{stats.totalInvestigations}</p>
                    </div>
                </div>

                <div className="stat-card glass-card">
                    <div className="stat-icon shield-icon">
                        <ShieldCheck size={28} />
                    </div>
                    <div className="stat-info">
                        <h3>Scams Avoided</h3>
                        <p className="stat-value">{stats.scamsAvoided}</p>
                    </div>
                </div>
            </section>

            {/* Recent Activity */}
            <section className="dashboard-activity glass-card">
                <div className="activity-header">
                    <h2><Activity size={20} /> Recent Activity</h2>
                </div>

                {stats.recentActivity && stats.recentActivity.length > 0 ? (
                    <div className="activity-list">
                        {stats.recentActivity.map((item) => {
                            const isScam = item.status === 'Scam' || item.ai_result?.toLowerCase() === 'fake';
                            const statusClass = isScam ? 'status-scam' : item.status === 'Genuine' ? 'status-genuine' : 'status-review';
                            const StatusIcon = isScam ? ShieldAlert : item.status === 'Genuine' ? ShieldCheck : Activity;

                            return (
                                <div key={item.id} className="activity-item" onClick={() => openModal(item)}>
                                    <div className={`activity-icon ${statusClass}`}>
                                        <StatusIcon size={20} />
                                    </div>
                                    <div className="activity-content">
                                        <h4>{item.category || 'General Inquiry'}</h4>
                                        <p className="activity-date">{item.dateReceived || 'Unknown Date'}</p>
                                        <p className="activity-snippet">{(item.message || '').substring(0, 60)}...</p>
                                    </div>
                                    <div className="activity-action">
                                        <ArrowRight size={20} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="no-activity">
                        <Search size={40} opacity={0.3} />
                        <p>You haven't run any investigations yet.</p>
                        <a href="/submit" className="btn-primary">Start a Verification</a>
                    </div>
                )}
            </section>

            <DiagnosticModal
                isOpen={isModalOpen}
                onClose={closeModal}
                data={selectedResult || {}}
            />
        </div>
    );
};

export default Dashboard;
