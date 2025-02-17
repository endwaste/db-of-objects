import React from 'react';

const Header: React.FC = () => (
  <div className="text-center">
    <img 
      src="https://endwaste.io/assets/logo_footer.png" 
      alt="Glacier Logo"
      style={{ width: "80px", height: "auto", marginBottom: "0.5rem", display: "block", marginLeft: "auto", marginRight: "auto" }} 
    />
    <h1 className="font-sans text-4xl mb-3" style={{color:"#466CD9"}}>Universal database of objects</h1>
    <h1 className="font-sans text-base mb-5 text-gray-900">Upload a photo or video (under 4.5 MB) or search by text</h1>
  </div>
);

export default Header;
