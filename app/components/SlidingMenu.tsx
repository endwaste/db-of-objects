"use client";

import { useState } from "react";

export default function SlidingMenu() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Hamburger Icon (3 lines) */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-6 left-6 z-[9999]
                   flex flex-col items-center justify-center
                   w-10 h-10 p-1 space-y-[4px] bg-transparent border-none"
        aria-label="Open Menu"
      >
        <span className="block w-6 h-[2px] bg-gray-900" />
        <span className="block w-6 h-[2px] bg-gray-900" />
        <span className="block w-6 h-[2px] bg-gray-900" />
      </button>

      {/* Gray transparent overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[9998] bg-gray-500 bg-opacity-50"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sliding Menu */}
      <div
        className={`
          fixed top-0 left-0 h-full w-64 bg-gray-100 
          transform transition-transform duration-300 z-[9999]
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Close Button */}
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-6 right-6 text-2xl text-gray-900"
          aria-label="Close Menu"
        >
          &times;
        </button>

        {/* Navigation */}
        <nav className="mt-16 ml-5 p-4">
          <ul className="space-y-6 font-sans text-base text-gray-900">
            <li>
              <a href="/" className="hover:underline">
                Home
              </a>
            </li>
            <li>
              <a href="/labeling/list" className="hover:underline">
                Labeling
              </a>
            </li>
            <li>
              <a href="/labeling/try" className="hover:underline">
                Try it out!
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </>
  );
}
