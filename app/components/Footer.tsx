import React from 'react';

const Footer: React.FC = () => {
  return (
    <div className="w-full mt-auto py-4 text-center text-gray-500 text-sm">
      <p>
        Built by Glacier using FastAPI, Pinecone, Next.js, React, and CLIP (OpenAI).
      </p>
    </div>
  );
};

export default Footer;
