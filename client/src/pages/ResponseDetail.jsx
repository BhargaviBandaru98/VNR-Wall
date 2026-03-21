import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import DiagnosticModal from '../components/DiagnosticModal';

const ResponseDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!id || id.length < 5) {
                console.error("Invalid ID:", id);
                setLoading(false);
                setError("Invalid investigation ID.");
                return;
            }

            try {
                setData(null);
                setError(null);
                setLoading(true);

                // Use relative path — axios global baseURL handles the host
                const res = await axios.get(`/api/datas/${id}`);
                console.log("DETAIL API RESPONSE:", res.data);

                const dataPayload = res.data;
                const finalData = dataPayload.submission || dataPayload;

                setData({
                    ...finalData,
                    ai_result: dataPayload.ai_result || finalData.ai_result,
                    requestor_role: dataPayload.requestor_role || 'user'
                });
            } catch (err) {
                console.error("Error fetching detail:", err);
                setError(err.response?.status === 404 ? "Investigation not found." : "Failed to load investigation.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [id]);

    if (loading) {
        return (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                </div>
                <p style={{ marginTop: '1rem' }}>Loading Investigation Details...</p>
            </div>
        );
    }

    if (error || !data || (!data._id && !data.id)) {
        return (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
                <h2>Investigation Not Found</h2>
                <p>{error || "The forensic data you are looking for does not exist or has been removed."}</p>
                <button
                    onClick={() => navigate('/responses')}
                    className="btn btn-primary mt-3"
                >
                    Back to Responses
                </button>
            </div>
        );
    }

    return (
        <div className="response-detail-page" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: '900px', marginBottom: '1rem' }}>
                <button
                    onClick={() => navigate(-1)}
                    style={{ background: 'transparent', border: 'none', color: '#2563eb', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}
                >
                    &larr; Back
                </button>
            </div>

            <DiagnosticModal
                isOpen={true}
                onClose={() => navigate(-1)}
                data={data}
            />
        </div>
    );
};

export default ResponseDetail;
