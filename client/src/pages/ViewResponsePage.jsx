import React, { useState, useEffect } from 'react';
import { Search, Shield, CheckCircle, Clock, User, Eye, Inbox, ArrowLeft } from 'lucide-react';
import axios from 'axios';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:6105';
import '../styles/ViewResponsesPage.css';
import StudentMessageCard from '../components/StudentMessageCards';

// Utility function for highlighting text
const highlightText = (text, searchTerm) => {
  if (!searchTerm) return text;
  const regex = new RegExp(`(${searchTerm})`, "gi");
  return text.split(regex).map((part, i) =>
    part.toLowerCase() === searchTerm.toLowerCase() ? (
      <mark key={i} className="highlight">{part}</mark>
    ) : (
      part
    )
  );
};

// Bottom Navigation Component
const BottomNavigation = ({ categories, activeCategory, setActiveCategory, counts }) => {
  return (
    <div className="bottom-nav-container">
      <div className="bottom-nav-grid">
        {categories.map((category) => (
          <button
            key={category.id}
            className={`bottom-nav-button ${activeCategory === category.id ? 'active' : ''} ${category.color}`}
            onClick={() => setActiveCategory(category.id)}
          >
            <div className="nav-icon">
              {category.icon}
            </div>
            <span className="nav-title">
              {category.shortTitle}
            </span>
            <span className={`nav-count ${category.color}`}>
              {category.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

// Category Page Component
const CategoryPage = ({
  category,
  messages,
  searchTerm,
  setSearchTerm,
  categories,
  activeCategory,
  setActiveCategory,
  counts,
  onBackToHome,
  onStatusUpdate
}) => {
  const [filteredMessages, setFilteredMessages] = useState([]);

  useEffect(() => {
    let filtered = messages;

    if (searchTerm.trim()) {
      const searchLower = searchTerm.trim().toLowerCase();
      filtered = filtered.filter(msg =>
        msg.messageContent.toLowerCase().includes(searchLower) ||
        msg.sender.toLowerCase().includes(searchLower) ||
        msg.platform.toLowerCase().includes(searchLower) ||
        msg.branch.toLowerCase().includes(searchLower) ||
        (msg.tags && msg.tags.some(tag => tag.toLowerCase().includes(searchLower)))
      );
    }

    setFilteredMessages(filtered);
  }, [messages, searchTerm]);

  return (
    <div className="category-page-container">
      {/* Header */}
      <div className="category-page-header">
        <div className="category-header-content">
          <div className="category-page-title">
            <button
              onClick={onBackToHome}
              className="back-button"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="category-page-icon-wrapper">
              <div className={`category-page-icon ${category.color}`}>
                {category.icon}
              </div>
              <div className="category-page-info">
                <h1>{category.title}</h1>
                <p>{category.description}</p>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="category-search-wrapper">
            <div>
              <Search className="category-search-icon" />
              <input
                type="text"
                placeholder={`Search in ${category.title.toLowerCase()}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="category-search"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="category-search-clear"
                >
                  ×
                </button>
              )}
            </div>

            <div className="category-page-stats">
              <div className="category-page-count">{category.count}</div>
              <div className="category-page-label">Messages</div>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Content */}
      <div className="category-content">
        {filteredMessages.length === 0 ? (
          <div className="no-results-container">
            <div className="no-results-emoji">📭</div>
            <h3 className="no-results-title">No messages found</h3>
            <p className="no-results-description">
              {searchTerm
                ? `No messages match your search "${searchTerm}"`
                : `No messages in this category yet`}
            </p>
          </div>
        ) : (
          <div className="row category-messages-grid">
            {filteredMessages.map(message => (
              <div className="col-md-6 col-lg-4 col-sm-12" key={message.id}>
                <div className="message-wrapper">
                  <StudentMessageCard
                    data={{
                      ...message,
                      highlightedMessage: highlightText(message.messageContent, searchTerm),
                      highlightedSender: highlightText(message.sender, searchTerm),
                      highlightedPlatform: highlightText(message.platform, searchTerm),
                    }}
                    onStatusUpdate={onStatusUpdate}
                  />
                  {message.submittedByUser && (
                    <div className="submission-badge">
                      <User size={12} />
                      <span>Your Submission</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation
        categories={categories}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        counts={counts}
      />
    </div>
  );
};

const ViewResponses = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState('home'); // 'home' or category id
  const [messages, setMessages] = useState([]);
  const [homeSearchResults, setHomeSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch messages from server
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${BACKEND_URL}/api/datas`);
        const serverMessages = res.data.map((item, index) => ({
          id: item.id || index + 1,
          category: item.category || 'Not specified',
          receivedDate: item.dateReceived || 'N/A',
          status: item.status === 'null' || item.status === null ? 'inreview'
            : item.status?.toLowerCase() === 'scam' ? 'scam'
              : item.status?.toLowerCase() === 'genuine' ? 'genuine'
                : 'inreview',
          branch: item.branch || 'N/A',
          year: item.year || 'N/A',
          platform: item.platform || 'Unknown',
          sender: item.sender || 'Anonymous',
          contact: item.contact || 'No Contact',
          responseStatus: item.responded || 'No',
          personalDetails: item.personalDetails || 'N/A',
          credibilityRating: parseInt(item.genuineRating) || 0,
          messageContent: item.message || '',
          tags: item.flags ? JSON.parse(item.flags) : [],
          submittedByUser: item.user_email === user?.email,
          // AI Verification fields
          scamScore: item.ai_score ?? null,
          aiResult: item.ai_result ?? null,
          aiConfidence: item.ai_confidence ?? null,
          aiEvidence: item.ai_evidence ?? null,
          aiChecked: !!item.ai_checked,
        }));
        setMessages(serverMessages);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching messages:', error);
        setLoading(false);
      }
    };
    fetchMessages();
  }, []);

  // Update message status
  const updateMessageStatus = async (messageId, newStatus) => {
    try {
      const formattedStatus = newStatus.charAt(0).toUpperCase() + newStatus.slice(1).toLowerCase();
      await axios.put(`${BACKEND_URL}/api/update-status/${messageId}`, {
        status: formattedStatus
      });
      const updatedMessages = messages.map(msg =>
        msg.id === messageId ? { ...msg, status: formattedStatus.toLowerCase() } : msg
      );
      setMessages(updatedMessages);
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  // Filter messages based on home search term
  useEffect(() => {
    if (currentPage === 'home' && searchTerm.trim()) {
      const filtered = messages.filter(msg =>
        msg.messageContent.toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.sender.toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.platform.toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.branch.toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (msg.tags && msg.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())))
      );
      setHomeSearchResults(filtered);
    } else {
      setHomeSearchResults([]);
    }
  }, [searchTerm, messages, currentPage]);

  // Optimized getCounts (single loop)
  const getCounts = () => {
    const counts = { all: messages.length, fake: 0, genuine: 0, inReview: 0, submitted: 0 };
    messages.forEach(msg => {
      if (msg.submittedByUser) counts.submitted++;
      switch (msg.status.toLowerCase()) {
        case 'scam':
          counts.fake++;
          break;
        case 'genuine':
          counts.genuine++;
          break;
        case 'inreview':
          counts.inReview++;
          break;
        default:
          break;
      }
    });
    return counts;
  };

  const counts = getCounts();

  const categories = [
    {
      id: 'all',
      title: 'All Messages',
      shortTitle: 'All',
      count: counts.all,
      icon: <Inbox className="category-icon" />,
      color: 'orange',
      description: 'All message types'
    },
    {
      id: 'scam',
      title: 'Scam Messages',
      shortTitle: 'Scam',
      count: counts.fake,
      icon: <Shield className="category-icon" />,
      color: 'red',
      description: 'Messages marked as suspicious'
    },
    {
      id: 'genuine',
      title: 'Genuine Messages',
      shortTitle: 'Genuine',
      count: counts.genuine,
      icon: <CheckCircle className="category-icon" />,
      color: 'green',
      description: 'Verified genuine messages'
    },
    {
      id: 'inreview',
      title: 'In Review Messages',
      shortTitle: 'In Review',
      count: counts.inReview,
      icon: <Clock className="category-icon" />,
      color: 'blue',
      description: 'Messages pending review'
    },
    {
      id: 'submitted',
      title: 'Your Submissions',
      shortTitle: 'Your Messages',
      count: counts.submitted,
      icon: <User className="category-icon" />,
      color: 'purple',
      description: 'Messages submitted by you'
    }
  ];

  // Handle category click to navigate to category page
  const handleCategoryClick = (categoryId) => {
    setCurrentPage(categoryId);
    setActiveCategory(categoryId);
    setSearchTerm('');
  };

  // Handle navigation from bottom nav
  const handleBottomNavClick = (categoryId) => {
    setCurrentPage(categoryId);
    setActiveCategory(categoryId);
    setSearchTerm(''); // Reset search when switching categories
  };

  // Get filtered messages for current category
  const getFilteredMessages = () => {
    if (currentPage === 'home' || activeCategory === 'all') return messages;

    if (activeCategory === 'submitted') {
      return messages.filter(msg => msg.submittedByUser);
    } else {
      return messages.filter(
        msg => msg.status.toLowerCase() === activeCategory.toLowerCase()
      );
    }
  };

  // Render home page
  if (currentPage === 'home') {
    return (
      <div className="view-responses-container">
        <div className="page-header">
          <h1 className="page-title">View Responses</h1>
          <p className="page-subtitle">Monitor and manage all message submissions</p>
        </div>

        {/* Search Bar */}
        <div className="search-container">
          <div className="search-wrapper">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder="Search messages, senders, platforms, or tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input home-search-bar"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="clear-search">
                ×
              </button>
            )}
          </div>
        </div>

        {/* Categories Grid */}
        <div className="container">
          <div className="row d-flex justify-content-center container-section">
            {categories.map(category => (
              <div className="col-md-4 col-sm-6 mb-md-4 mb-2" key={category.id}>
                <div
                  className={`category-card mb-3 ${category.color} ${activeCategory === category.id ? 'active' : ''} home-category-card`}
                  onClick={() => handleCategoryClick(category.id)}
                >
                  <div className="category-header">
                    <div className="category-icon-wrapper">{category.icon}</div>
                    <div className="category-info">
                      <h3 className="category-title">{category.title}</h3>
                      <p className="category-description">{category.description}</p>
                    </div>
                  </div>
                  <div className="category-count">
                    <span className="count-number">{category.count}</span>
                    <span className="count-label">Messages</span>
                  </div>
                  <div className="category-action">
                    <Eye className="view-icon" />
                    <span>View All</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Search Results Section */}
        {searchTerm && (
          <div className="search-results-section">
            <div className="search-results-header">
              <div className="search-results-title">
                <Search className="search-icon-title" />
                <h2>Search Results for "{searchTerm}"</h2>
              </div>
              <p className="search-results-description">
                Found {homeSearchResults.length} message{homeSearchResults.length !== 1 ? 's' : ''} matching your search
              </p>
            </div>

            {homeSearchResults.length === 0 ? (
              <div className="search-no-results">
                <div className="search-no-results-emoji">🔍</div>
                <h3>No messages found</h3>
                <p>No messages match your search term "{searchTerm}"</p>
              </div>
            ) : (
              <div className="search-results-grid">
                {homeSearchResults.map(message => (
                  <div key={message.id} className="message-wrapper animate-fade-in search-highlight">
                    <StudentMessageCard
                      data={{
                        ...message,
                        highlightedMessage: highlightText(message.messageContent, searchTerm),
                        highlightedSender: highlightText(message.sender, searchTerm),
                        highlightedPlatform: highlightText(message.platform, searchTerm),
                      }}
                      onStatusUpdate={updateMessageStatus}
                    />
                    {message.submittedByUser && (
                      <div className="submission-badge">
                        <User size={12} />
                        <span>Your Submission</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Render category page
  const currentCategory = categories.find(cat => cat.id === currentPage);
  const categoryMessages = getFilteredMessages();

  return (
    <CategoryPage
      category={currentCategory}
      messages={categoryMessages}
      searchTerm={searchTerm}
      setSearchTerm={setSearchTerm}
      categories={categories}
      activeCategory={activeCategory}
      setActiveCategory={handleBottomNavClick}
      counts={counts}
      onBackToHome={() => setCurrentPage('home')}
      onStatusUpdate={updateMessageStatus}
    />
  );
};

export default ViewResponses;
