import React, { useState, useEffect } from 'react';
import '../styles/SubmitPage.css';
import axios from 'axios'

// Helper to parse cookies
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}
import 'flatpickr/dist/flatpickr.min.css';

const SubmitPage = () => {
  // Form state
  const [formData, setFormData] = useState({
    mail: '',
    branch: '',
    year: '',
    dateReceived: '',
    platform: '',
    sender: '',
    contact: '',
    category: '',
    flags: [],
    responded: '',
    personalDetails: '',
    genuineRating: '',
    message: ''
  });
  
  // Handle input changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (type === 'checkbox') {
      // Handle checkbox (multi-select)
      if (checked) {
        setFormData({
          ...formData,
          flags: [...formData.flags, value]
        });
      } else {
        setFormData({
          ...formData,
          flags: formData.flags.filter(flag => flag !== value)
        });
      }
    } else {
      // Handle other inputs
      setFormData({
        ...formData,
        [name]: value
      });
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    // Parse user cookie and get email
    let userCookie = getCookie('user');
    let email = '';
    if (userCookie) {
      try {
        const userObj = JSON.parse(decodeURIComponent(userCookie));
        email = userObj.email || '';
      } catch (err) {
        email = '';
      }
    }
    const dataToSend = { ...formData, mail: email };
    console.log('Form Data:', dataToSend);

    let res = await axios.post(import.meta.env.VITE_WALL_API_URL + '/api/user-check-data', dataToSend);
    if (res.data.success === true) {
      alert("Data is saved successfully");
      window.location.href = "/responses";
    }
  };

  // Initialize flatpickr for date input
  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('flatpickr').then(({ default: flatpickr }) => {
        flatpickr("#dateReceived", {
          dateFormat: "d-m-Y",
          maxDate: "today",
          altInput: false,
          allowInput: true,
          disableMobile: true,
          onChange: (selectedDates, dateStr) => {
            setFormData(prev => ({
              ...prev,
              dateReceived: dateStr
            }));
          }
        });
      });
    }
  }, []);

  return (
    <main className="form-container">
      <div className="form-header">
        <h2>Submit Info for Verification</h2>
        <div className="header-line"></div>
      </div>
      <form id="infoForm" onSubmit={handleSubmit}>
        {/* Student Details */}
        <div className="form-section">
          <h3>Academic Information</h3>
          
          <div className="input-group">
            <label htmlFor="branch">Branch:</label>
            <select 
              id="branch" 
              name="branch" 
              value={formData.branch}
              onChange={handleChange}
              required
            >  
              <option value="" disabled>Select your branch</option>
              <option>CSE</option>
              <option>CS - AIML</option>
              <option>CS - DS</option>
              <option>CS - IOT</option>
              <option>CS - CYS</option>
              <option>AI & DS</option>
              <option>CSBS</option>
              <option>IT</option>
              <option>ECE</option>
              <option>EEE</option>
              <option>EIE</option>
              <option>CE</option>
              <option>ME</option>
              <option>AE</option>
              <option>Faculty</option>
            </select>
          </div>

          <div className="input-group">
            <label>Year of Study:</label>
            <div className="radio-group">
              {['1st Year', '2nd Year', '3rd Year', '4th Year', 'Faculty'].map(year => (
                <label key={year} className="radio-label">
                  <input 
                    type="radio" 
                    name="year" 
                    value={year} 
                    checked={formData.year === year}
                    onChange={handleChange}
                    required
                  />
                  <span className="radio-custom"></span>
                  {year}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Message Details */}
        <div className="form-section">
          <h3>Message Information</h3>
          
          <div className="input-group">
            <label htmlFor="dateReceived">When was the message received?</label>
            <input
              type="text"
              id="dateReceived"
              name="dateReceived"
              placeholder="dd-mm-yyyy"
              value={formData.dateReceived}
              onChange={handleChange}
              maxLength="10"
              required
            />
            <small id="dateError" style={{ color: 'red', display: 'none' }}>
              Please enter a valid date.
            </small>
          </div>

          <div className="input-group">
            <label htmlFor="platform">Where was the message?</label>
            <select
              id="platform"
              name="platform"
              value={formData.platform}
              onChange={handleChange}
              required
            >
              <option value="" disabled>Select platform</option>
              <option value="Class Unofficial Group">Class Unofficial Group</option>
              <option value="Class Official Group">Class Official Group</option>
              <option value="College Mail">College Mail</option>
              <option value="Personal Mail">Personal Mail</option>
              <option value="LinkedIn">LinkedIn</option>
              <option value="WhatsApp Message">WhatsApp Message</option>
              <option value="Call">Call</option>
              <option value="Other">Other</option>
            </select>
            {formData.platform === 'Other' && (
              <input
                type="text"
                name="platformOther"
                className="other-input"
                placeholder="Please specify..."
                value={formData.platformOther || ''}
                onChange={e => setFormData({
                  ...formData,
                  platformOther: e.target.value
                })}
                required
              />
            )}
          </div>

          <div className="input-group">
            <label htmlFor="sender">Who sent you this message (Company/Individual):</label>
            <input 
              type="text" 
              id="sender" 
              name="sender" 
              placeholder="Enter name" 
              value={formData.sender}
              onChange={handleChange}
              required 
            />
          </div>

          <div className="input-group">
            <label htmlFor="contact">Contact information of sender (Phone/Mail/LinkedIn):</label>
            <input 
              type="text" 
              id="contact" 
              name="contact" 
              placeholder="Enter contact info" 
              value={formData.contact}
              onChange={handleChange}
              required 
            />
          </div>

          <div className="input-group">
            <label htmlFor="category">What is the category of message?</label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={handleChange}
              required
            >
              <option value="" disabled>Select category</option>
              <option value="Internship">Internship</option>
              <option value="Placement">Placement</option>
              <option value="Training">Training</option>
              <option value="Training and Internship">Training and Internship</option>
              <option value="Certificate Course">Certificate Course</option>
              <option value="Exam Drive">Exam Drive</option>
              <option value="Scholarship">Scholarship</option>
              <option value="Other">Other</option>
            </select>
            {formData.category === 'Other' && (
              <input
                type="text"
                name="categoryOther"
                className="other-input"
                placeholder="Please specify..."
                value={formData.categoryOther || ''}
                onChange={e => setFormData({
                  ...formData,
                  categoryOther: e.target.value
                })}
                required
              />
            )}
          </div>
        </div>

        <div className="form-section">
          <h3>Message Analysis</h3>
          
          <div className="input-group">
            <label>Did the message have any of the following elements?</label>
            <div className="checkbox-group">
              {[
                'Asking for payment/fee',
                'Requesting banking details or Aadhar/PAN',
                'Unreasonable deadlines',
                'Urgent response needed',
                'Poor grammar/spelling',
                'Unknown or verified sender',
                'Refused to give further info',
                'Fake LinkedIn or website',
                'Unofficial company information',
                'Other'
              ].map(flag => (
                <label key={flag} className="checkbox-label">
                  <input 
                    type="checkbox" 
                    name="flags" 
                    value={flag} 
                    checked={formData.flags.includes(flag)}
                    onChange={handleChange}
                  />
                  <span className="checkbox-custom"></span>
                  {flag}
                  {flag === 'Other' && formData.flags.includes('Other') && (
                    <input 
                      type="text" 
                      name="flagOther" 
                      className="other-input"
                      placeholder="Please specify..."
                      onChange={handleChange}
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
              
          <div className="input-group">
            <label>Have you responded to the opportunity?</label>
            <div className="radio-group">
              {['Yes', 'No', 'Considering'].map(responded => (
                <label key={responded} className="radio-label">
                  <input 
                    type="radio" 
                    name="responded" 
                    value={responded} 
                    checked={formData.responded === responded}
                    onChange={handleChange}
                    required
                  />
                  <span className="radio-custom"></span>
                  {responded}
                </label>
              ))}
            </div>
          </div>

          <div className="input-group">
            <label>Did they take any personal details?</label>
            <div className="radio-group">
              {['Yes', 'No', 'Only name and phone', 'Other'].map(detail => (
                <label key={detail} className="radio-label">
                  <input 
                    type="radio" 
                    name="personalDetails" 
                    value={detail} 
                    checked={formData.personalDetails === detail}
                    onChange={handleChange}
                    required
                  />
                  <span className="radio-custom"></span>
                  {detail}
                  {detail === 'Other' && formData.personalDetails === 'Other' && (
                    <input 
                      type="text" 
                      name="personalDetails" 
                      className="other-input"
                      placeholder="Please specify..."
                      onChange={handleChange}
                    />
                  )}
                </label>
              ))}
            </div>
          </div>

          <div className="input-group user-genuine">
            <label>How genuine do you think the message is?</label>
            <br></br>
            <div className="rating-group">
              {[1, 2, 3, 4, 5].map(rating => (
                <label key={rating} className="rating-label">
                  <input 
                    type="radio" 
                    name="genuineRating" 
                    value={rating.toString()} 
                    checked={formData.genuineRating === rating.toString()}
                    onChange={handleChange}
                    required
                  />
                  <span className="rating-number">{rating}</span>
                </label>
              ))}
            </div>
            <div className="rating-labels">
              <span>Not Genuine</span>
              <span>Very Genuine</span>
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="message">Message in Circulation (Paste it as-is):</label>
            <textarea 
              id="message" 
              name="message" 
              rows="6" 
              placeholder="Paste the full message here..." 
              value={formData.message}
              onChange={handleChange}
              required
            ></textarea>
          </div>
        </div>

        <button type="submit" className="submit-btn">
          <span>Submit Report</span>
          <div className="btn-ripple"></div>
        </button>
      </form>
    </main>
  );
};

export default SubmitPage;
