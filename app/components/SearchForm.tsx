import React from 'react';
import { PhotoFrameIcon, MagnifyingGlassIcon } from './Icons';

interface SearchFormProps {
  query: string;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isInputEmpty: boolean;
  isUploading: boolean;
  isSearching: boolean;
  clearResults: () => void;
  suggestions: string[]; // Pass the full suggestions list
  handleSuggestionClick: (suggestion: string) => void;
  showSuggestions: boolean;
  handleFocus: () => void; // New prop for focus
}

const SearchForm: React.FC<SearchFormProps> = ({
  query,
  handleInputChange,
  handleSubmit,
  handleFileChange,
  isInputEmpty,
  isUploading,
  isSearching,
  clearResults,
  suggestions,
  handleSuggestionClick,
  showSuggestions,
  handleFocus,
}) => {
  return (
    <form onSubmit={handleSubmit} className="flex items-center">
      <div className="flex-grow flex items-center bg-white rounded shadow-md">
        <div className="flex-grow relative">
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={handleFocus} // Show all suggestions on focus
            placeholder="Describe the object, or drag in an image or video"
            className="w-full flex-grow px-6 py-3 text-gray-700 bg-transparent focus:outline-none"
            disabled={isUploading || isSearching}
          />
          
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 mt-2 w-full bg-white border rounded shadow-lg max-h-60 overflow-y-auto z-10">
              {suggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="px-6 py-1.5 hover:bg-gray-100 cursor-pointer text-gray-700 flex items-center"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  <MagnifyingGlassIcon className="h-4 w-4 mr-3 text-indigo-500" />
                  {suggestion}
                </div>
              ))}
            </div>
          )}
        </div>
        <input
          type="file"
          accept="image/*,video/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          id="upload-input"
          disabled={isUploading || isSearching}
        />
        {!isInputEmpty && (
          <>
            <button
              type="button"
              onClick={clearResults}
              className="text-gray-400 hover:text-gray-500 mr-0.5 focus:outline-none"
              disabled={isUploading || isSearching}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="44"
                height="44"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </button>
          </>
        )}
        <label htmlFor="upload-input" className={`cursor-pointer px-4 ${isUploading || isSearching ? 'text-gray-400' : 'text-gray-500 hover:text-gray-700'} focus:outline-none`}>
          <PhotoFrameIcon className="h-6 w-6" />
        </label>
      </div>
      <button
        type="submit"
        className={`ml-1 px-3 ${isInputEmpty
            ? 'text-gray-400 cursor-not-allowed'
            : isUploading || isSearching
              ? 'text-gray-400 cursor-wait'
              : 'text-gray-500 hover:text-gray-700'
          } focus:outline-none`}
        disabled={isInputEmpty || isUploading || isSearching}
      >
        <MagnifyingGlassIcon className="h-6 w-6 text-indigo-500 hover:text-indigo-700" />
      </button>
    </form>
  );
};

export default SearchForm;
