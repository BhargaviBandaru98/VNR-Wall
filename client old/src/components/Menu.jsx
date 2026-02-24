// import React, { useState, useEffect } from 'react'
// import { Link } from 'react-router-dom'
// import '../styles/Menu.css'
// import { FaHome, FaEnvelopeOpenText, FaListAlt, FaUser, FaBars } from 'react-icons/fa'

// const Menu = () => {
//   const [isLoggedIn, setIsLoggedIn] = useState(false)
//   const [isMenuOpen, setIsMenuOpen] = useState(false)
//   const [isMobile, setIsMobile] = useState(false)

//   useEffect(() => {
//     const user = localStorage.getItem('user')
//     setIsLoggedIn(!!user)
    
//     const checkScreenSize = () => {
//       setIsMobile(window.innerWidth < 1024)
//     }
    
//     checkScreenSize()
//     window.addEventListener('resize', checkScreenSize)
    
//     return () => window.removeEventListener('resize', checkScreenSize)
//   }, [])

//   const toggleMenu = () => {
//     setIsMenuOpen(!isMenuOpen)
//   }

//   return (
//     <div className="menu-container">
      

//       {/* Navigation Buttons */}
//       <div >
//          <Link to="/" className="nav-btn" onClick={() => setIsMenuOpen(false)}>
//           <FaHome className="nav-icon" /> Home
//         </Link>
//         <Link to="/submit" className="nav-btn" onClick={() => setIsMenuOpen(false)}>
//           <FaEnvelopeOpenText className="nav-icon" /> Submit Info
//         </Link>
//         <Link to="/responses" className="nav-btn" onClick={() => setIsMenuOpen(false)}>
//           <FaListAlt className="nav-icon" /> View Responses
//         </Link>
//         <Link to="/login" className="nav-btn" onClick={() => setIsMenuOpen(false)}>
//           <FaUser className="nav-icon" /> {isLoggedIn ? 'Profile' : 'Login'}
//         </Link>
       
//       </div>
//     </div>
//   )
// }

// export default Menu;