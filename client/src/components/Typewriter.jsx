import React, { useState, useEffect } from "react";

const Typewriter = ({ words, typingSpeed = 70, deletingSpeed = 30, delay = 900 }) => {
  const [text, setText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    const currentWord = words[wordIndex];
    let timer;

    if (!isDeleting && charIndex < currentWord.length) {
      timer = setTimeout(() => {
        setText((prev) => prev + currentWord.charAt(charIndex));
        setCharIndex((prev) => prev + 1);
      }, typingSpeed);
    } else if (isDeleting && charIndex > 0) {
      timer = setTimeout(() => {
        setText((prev) => prev.slice(0, -1));
        setCharIndex((prev) => prev - 1);
      }, deletingSpeed);
    } else if (!isDeleting && charIndex === currentWord.length) {
      timer = setTimeout(() => setIsDeleting(true), delay);
    } else if (isDeleting && charIndex === 0) {
      setIsDeleting(false);
      setWordIndex((prev) => (prev + 1) % words.length);
    }

    return () => clearTimeout(timer);
  }, [charIndex, isDeleting, words, wordIndex, typingSpeed, deletingSpeed, delay]);

  return (
    <span>
      {text}
      <span className="cursor">|</span>
    </span>
  );
};

export default Typewriter;
