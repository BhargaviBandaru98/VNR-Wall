
import React, { useState, useEffect } from 'react';
import { Calendar, ChevronDown, ChevronUp, Star } from 'lucide-react';
import axios from 'axios';
import '../styles/StudentMessagesCards.css';

const StudentMessageCard = ({ data, onStatusUpdate }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'inreview': return 'status-inreview';
      case 'genuine': return 'status-genuine';
      case 'fake': return 'status-fake';
      default: return 'status-default';
    }
  };

  const getCategoryColor = (category) => {
    switch (category.toLowerCase()) {
      case 'exam drive': return 'category-exam-drive';
      case 'placement': return 'category-placement';
      case 'internship': return 'category-internship';
      default: return 'category-default';
    }
  };

  const renderStars = (rating, total) => (
    <div className="stars-container">
      {[...Array(5)].map((_, i) => (
        <Star key={i} size={14} className={i < rating ? 'star-filled' : 'star-empty'} />
      ))}
      <span className="rating-text">({rating}/{total})</span>
    </div>
  );

  return (
    <div className="student-card enhanced-card">
      {/* Header */}
      <div className="card-header">
        <span className={`category-badge ${getCategoryColor(data.category)}`}>
          {data.category}
        </span>
        <div className="header-right">
          <div className="date-container">
            <Calendar size={12} className="calendar-icon" />
            Received on: {data.receivedDate}
          </div>
          <span className={`status-badge ${getStatusColor(data.status)}`}>
            {data.status}
          </span>
        </div>
      </div>

      {/* Student Academic Info */}
      <div className="section academic-info">
        <div className="section-header">
          <span className="section-title">🧑‍🎓 Student Academic Info</span>
        </div>
        <div className="academic-details">
          <div className="detail-item">
            <span className="label">Branch:</span>
            <span className="value">{data.branch}</span>
          </div>
          <div className="detail-item">
            <span className="label">Year:</span>
            <span className="year-badge">{data.year}</span>
          </div>
        </div>
      </div>

      {/* Source and Feedback */}
      <div className="row dual-section d-flex justify-content-around">
        <div className="col-5 section source-section">
          <div className="section-header">
            <span className="section-title">📩 Source of Message</span>
          </div>
          <div className="source-details">
            <div className="detail-row">
              <span className="label">Platform:</span> 
              <span className="platform-badge">{data.platform}</span>
            </div>
            <div className="detail-row">
              <span className="label">Sender:</span> 
              <span className="sender-name">{data.sender}</span>
            </div>
            <div className="detail-row">
              <span className="label">Contact:</span> 
              <span className="contact-info">{data.contact}</span>
            </div>
          </div>
        </div>

        <div className="col-5 section feedback-section">
          <div className="section-header">
            <span className="section-title ">⭐ Student Response</span>
          </div>
          <div className="feedback-details">
            <div className="detail-row">
              <span className="label">Responded Status:</span>
              <span className={`response-status ${
                data.responseStatus === 'Yes' ? 'status-yes' : 
                data.responseStatus === 'No' ? 'status-no' : 'status-considering'
              }`}>
                {data.responseStatus}
              </span>
            </div>
            <div className="detail-row">
              <span className="label">Details Shared:</span> 
              <span className="details-shared">{data.personalDetails}</span>
            </div>
            <div className="detail-row">
              <span className="label">Credibility:</span>
              <div className="credibility-rating">{renderStars(data.credibilityRating, 5)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Message Content */}
      <div className="section message-section">
        <div className="section-header">
          <span className="section-title">💬 Message Content</span>
          <button onClick={() => setIsExpanded(!isExpanded)} className="expand-button">
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
        <div className={`message-content ${isExpanded ? 'expanded' : 'collapsed'}`}>
          {data.messageContent}
        </div>
        {data.tags && data.tags.length > 0 && (
          <div className="tags-container">
            {data.tags.map((tag, index) => (
              <span key={index} className={`tag ${
                tag === 'Urgent' ? 'tag-urgent' :
                tag === 'Info Incomplete' ? 'tag-incomplete' :
                'tag-default'
              }`}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Enhanced hover effect overlay */}
      <div className="card-overlay"></div>
    </div>
  );
};

export default StudentMessageCard;
