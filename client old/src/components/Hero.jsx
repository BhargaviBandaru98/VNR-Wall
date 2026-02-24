import React from "react";
import Typewriter from "./Typewriter";
import "../styles/Hero.css";
import { Link } from "react-router-dom";

const Hero = () => {
return (
    <section className="hero">
        <div className="circle circle-1"></div>
        <div className="circle circle-2"></div>

        <div className="hero__content">
            <h1>Verify WALL Helps<br />You to 
            </h1>
            <h2>
                <Typewriter
                    words={["Find Genuine Opportunities", "Detect Fake Intership Call", "Detect Job Scams","Reduce Risk of Exploitation"]}
                />
            </h2>
            <p>
                Verify WALL helps you find Genuine Opportunities. Check Every Opportunity you receive- whether its a <span style={{ color: "#228B22", fontWeight:'bold' }}>Genuine</span>  or a <span style={{color: 'red',fontWeight:'bold'}}>Fake call</span> before you accept the offer. <span style={{fontWeight:'bold'}}> Stop trapping into fake Internship, Placement, Training & Job Scams!</span>
            </p>
            <Link to="/responses"> <button className="cta px-4">Responses</button> </Link>
        </div>
    </section>
);
};

export default Hero;