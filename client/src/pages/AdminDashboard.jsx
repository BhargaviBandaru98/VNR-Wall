import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Users, School, PieChart, BarChart } from 'lucide-react';
import '../styles/AdminDashboard.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:6105';

const AdminDashboard = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const res = await axios.get(`${BACKEND_URL}/api/admin/analytics`);
                setData(res.data);
            } catch (error) {
                console.error("Failed to fetch analytics:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchAnalytics();
    }, []);

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
                        <span className="stat-label">Total Unique Users</span>
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
