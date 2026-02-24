import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/ActionCard.css';

const ActionCard = ({ logo, title, description, buttonText, linkTo }) => {
  const navigate = useNavigate();
  
  return (
    <div className="card">
      <div className="card-logo">{logo}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      <button onClick={() => navigate(linkTo)}>{buttonText}</button>
    </div>
  );
};

export default ActionCard;