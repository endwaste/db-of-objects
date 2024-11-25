import React from 'react';
import { MagnifyingGlassIcon, PhotoFrameIcon } from './Icons';

// Define props
type SearchFormProps = {
  query: string;
  handleInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (event: React.FormEvent) => void;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isInputEmpty: boolean;
  isUploading: boolean;
  isSearching: boolean;
  clearResults: () => void;
  suggestions: string[];
  handleSuggestionClick: (suggestion: string) => void;
  showSuggestions: boolean;
  handleFocus: () => void;
  openModal: () => void;
};

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
  openModal, // Function to open UploadModal
}) => {
  return (
    <form onSubmit={handleSubmit} className="flex items-center ">
      <div className="flex-grow flex items-center bg-white rounded shadow-md w-3/5 max-w-2xl">
        {/* Input Field */}
        <div className="flex-grow relative">
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={handleFocus}
            placeholder="Describe the object, or drag in an image or video"
            className="w-full flex-grow px-6 py-3 text-gray-700 bg-transparent focus:outline-none"
            disabled={isUploading || isSearching}
          />

          {/* Suggestions Dropdown */}
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

        {/* File Input (Hidden) */}
        <input
          type="file"
          accept="image/*,video/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          id="upload-input"
          disabled={isUploading || isSearching}
        />

        {/* Image Icon */}
        <label
          htmlFor="upload-input"
          className={`cursor-pointer px-4 ${isUploading || isSearching ? 'text-gray-400' : 'text-gray-500 hover:text-gray-700'} focus:outline-none`}
        >
          <PhotoFrameIcon className="h-6 w-6" />
        </label>
      </div>

      {/* Magnifying Glass Icon */}
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

      {/* Plus Icon for UploadModal */}
      <button
        type="button"
        onClick={openModal}
        className="ml-1 px-3 text-gray-500 hover:text-gray-700 focus:outline-none"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
          className="h-6 w-6 text-indigo-500 hover:text-indigo-700"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </form>
  );
};

export default SearchForm;
