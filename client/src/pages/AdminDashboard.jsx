import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Users, School, PieChart, BarChart, ShieldCheck, Clock, ClipboardList, CheckCircle, AlertCircle, Trash2, ToggleLeft, ToggleRight, BrainCircuit } from 'lucide-react';
import '../styles/AdminDashboard.css';
import AdminReviewCard from '../components/AdminReviewCard';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:6105';

const AdminDashboard = () => {
    const [data, setData] = useState(null);
    const [inReviewSubmissions, setInReviewSubmissions] = useState([]);
    const [learningRules, setLearningRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const fetchAnalytics = async () => {
        try {
            const res = await axios.get(`${BACKEND_URL}/api/admin/analytics`);
            setData(res.data);
        } catch (error) {
            console.error("Failed to fetch analytics:", error);
        }
    };

    const fetchInReview = async () => {
        try {
            const res = await axios.get(`${BACKEND_URL}/api/admin/in-review`);
            setInReviewSubmissions(res.data);
        } catch (error) {
            console.error("Failed to fetch in-review submissions:", error);
        }
    };

    const fetchLearningRules = async () => {
        try {
            const res = await axios.get(`${BACKEND_URL}/api/admin/learning-rules`);
            setLearningRules(res.data);
        } catch (error) {
            console.error("Failed to fetch learning rules:", error);
        }
    };

    useEffect(() => {
        const loadAll = async () => {
            setLoading(true);
            await Promise.all([fetchAnalytics(), fetchInReview(), fetchLearningRules()]);
            setLoading(false);
        };
        loadAll();
    }, []);


    const handleVerdictSubmitted = (id) => {
        // Remove from local list and refresh counts
        setInReviewSubmissions(prev => prev.filter(s => s.id !== id));
        fetchAnalytics(); 
        fetchLearningRules(); // Refresh rules list as a new one might have been created
    };

    const handleToggleRule = async (id) => {
        try {
            await axios.put(`${BACKEND_URL}/api/admin/learning-rules/${id}/toggle`);
            setLearningRules(prev => prev.map(r => r.id === id ? { ...r, is_active: 1 - r.is_active } : r));
        } catch (error) {
            console.error("Failed to toggle rule:", error);
        }
    };

    const handleDeleteRule = async (id) => {
        if (!window.confirm("Delete this learning rule permanently?")) return;
        try {
            await axios.delete(`${BACKEND_URL}/api/admin/learning-rules/${id}`);
            setLearningRules(prev => prev.filter(r => r.id !== id));
        } catch (error) {
            console.error("Failed to delete rule:", error);
        }
    };



    if (loading) return <div className="admin-loader">Analyzing Demographics...</div>;
    if (!data) return <div>Error loading analytics</div>;

    return (
        <main className="admin-container">
            <div className="admin-header">
                <h1>Admin Analytics</h1>
                <p>Real-time Platform Reach & Student Demographics</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <Users className="stat-icon" />
                    <div className="stat-info">
                        <span className="stat-label">Total Unique Logins</span>
                        <span className="stat-value">{data.totalUsers}</span>
                    </div>
                </div>

                <div className="stat-card">
                    <School className="stat-icon" />
                    <div className="stat-info">
                        <span className="stat-label">Colleges Reached</span>
                        <span className="stat-value">{data.uniqueCollegesCount}</span>
                    </div>
                </div>
            </div>

            {/* System Efficiency */}
            <h2 className="section-title">Platform Efficiency</h2>
            <div className="stats-grid efficiency-grid">
                <div className="stat-card auto-verify">
                    <ShieldCheck className="stat-icon auto-icon" />
                    <div className="stat-info">
                        <span className="stat-label">Automatic Verifications (AI)</span>
                        <span className="stat-value">{data.investigations?.autoVerifications || 0}</span>
                    </div>
                </div>
                <div className="stat-card manual-req">
                    <ClipboardList className="stat-icon manual-icon" />
                    <div className="stat-info">
                        <span className="stat-label">Manual Verifications</span>
                        <span className="stat-value">{data.investigations?.manualRequests || 0}</span>
                    </div>
                </div>
            </div>

            {/* Workflow Trackers */}
            <h2 className="section-title">Manual Review Workflow</h2>
            <div className="stats-grid workflow-grid">
                <div className="stat-card">
                    <ClipboardList className="stat-icon" />
                    <div className="stat-info">
                        <span className="stat-label">Total In-Review</span>
                        <span className="stat-value">{data.investigations?.total || 0}</span>
                    </div>
                </div>

                <div className="stat-card clickable pending-card" onClick={() => navigate('/responses')}>
                    <Clock className="stat-icon pending-icon" />
                    <div className="stat-info">
                        <span className="stat-label">Pending Action</span>
                        <span className="stat-value pending-val">{data.investigations?.pendingManual || 0}</span>
                    </div>
                    <div className="card-hint">Click to resolve ➔</div>
                </div>

                <div className="stat-card">
                    <CheckCircle className="stat-icon completed-icon" />
                    <div className="stat-info">
                        <span className="stat-label">Completed</span>
                        <span className="stat-value">{data.investigations?.completedManual || 0}</span>
                    </div>
                </div>
            </div>

            <div className="charts-layout">
                <div className="chart-item">
                    <div className="chart-header">
                        <PieChart size={20} />
                        <h3>User Role Distribution</h3>
                    </div>
                    <div className="role-list">
                        {data.roles.map(role => (
                            <div key={role.user_role} className="role-row">
                                <span className="role-name">{role.user_role}</span>
                                <div className="role-bar-bg">
                                    <div
                                        className="role-bar-fill"
                                        style={{ width: `${(role.count / data.totalUsers) * 100}%` }}
                                    ></div>
                                </div>
                                <span className="role-count">{Math.round((role.count / data.totalUsers) * 100)}%</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="chart-item">
                    <div className="chart-header">
                        <BarChart size={20} />
                        <h3>Student Demographics</h3>
                    </div>
                    <div className="demo-list">
                        {data.demographics.filter(d => d.year_of_study).map(demo => (
                            <div key={demo.year_of_study} className="role-row">
                                <span className="role-name">{demo.year_of_study}</span>
                                <div className="role-bar-bg">
                                    <div
                                        className="role-bar-fill demo-fill"
                                        style={{ width: `${(demo.count / data.totalUsers) * 100}%` }}
                                    ></div>
                                </div>
                                <span className="role-count">{demo.count} Users</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Phase 3: In Review Submissions ────────────────────────────── */}
            <section className="in-review-section">
                <div className="section-header-flex">
                    <h2 className="section-title">🔍 In Review Submissions</h2>
                    <span className="count-label">{inReviewSubmissions.length} Pending</span>
                </div>

                {inReviewSubmissions.length === 0 ? (
                    <div className="empty-review-state glass-card">
                        <AlertCircle className="icon-info" />
                        <p>No submissions currently require manual review. System is efficient.</p>
                    </div>
                ) : (
                    <div className="review-list">
                        {inReviewSubmissions.map(sub => (
                            <AdminReviewCard 
                                key={sub.id} 
                                data={sub} 
                                onVerictSubmitted={handleVerdictSubmitted}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* ── Phase 6: Learning Rule Management ───────────────────────── */}
            <section className="learning-rules-section">
                <div className="section-header-flex">
                    <h2 className="section-title"><BrainCircuit size={24} style={{ marginRight: '10px', verticalAlign: 'middle' }} /> AI Learning Rules</h2>
                    <span className="count-label">{learningRules.length} Active Rules</span>
                </div>

                <div className="rules-glass-container glass-card">
                    {learningRules.length === 0 ? (
                        <p className="empty-text">No learning rules created yet. They appear when you provide verification feedback.</p>
                    ) : (
                        <div className="rules-table-wrapper">
                            <table className="rules-table">
                                <thead>
                                    <tr>
                                        <th>Pattern (AI Extracted)</th>
                                        <th>Verdict</th>
                                        <th>Created</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {learningRules.map(rule => (
                                        <tr key={rule.id}>
                                            <td className="rule-pattern">{rule.pattern}</td>
                                            <td>
                                                <span className={`verdict-tag ${rule.admin_decision.toLowerCase()}`}>
                                                    {rule.admin_decision}
                                                </span>
                                            </td>
                                            <td className="rule-date">{new Date(rule.created_at).toLocaleDateString()}</td>
                                            <td>
                                                <button 
                                                    className={`status-toggle ${rule.is_active ? 'active' : 'inactive'}`}
                                                    onClick={() => handleToggleRule(rule.id)}
                                                >
                                                    {rule.is_active ? <ToggleRight size={32} color="#10b981" /> : <ToggleLeft size={32} color="#94a3b8" />}
                                                </button>
                                            </td>
                                            <td>
                                                <button className="delete-rule-btn" onClick={() => handleDeleteRule(rule.id)}>
                                                    <Trash2 size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>



            <div className="college-tracking">
                <h3>Active Colleges</h3>
                <div className="college-tags">
                    {data.colleges.map(college => (
                        <span key={college} className="college-tag">{college}</span>
                    ))}
                </div>
            </div>
        </main>
    );
};

export default AdminDashboard;
