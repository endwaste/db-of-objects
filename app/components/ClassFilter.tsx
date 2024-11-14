import React from 'react';

interface ClassFilterProps {
  selectedClass: string;
  onClassChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  availableClasses: string[];
}

const ClassFilter: React.FC<ClassFilterProps> = ({ selectedClass, onClassChange, availableClasses }) => {
  return (
    <div className="flex justify-center mb-4">
      <label htmlFor="class-filter" className="mr-2 text-gray-700">Class:</label>
      <select
        id="class-filter"
        value={selectedClass}
        onChange={onClassChange}
        className="custom-dropdown border rounded text-gray-700"
      >
        <option value="">All</option>
        {availableClasses.map((className, index) => (
          <option key={index} value={className}>{className}</option>
        ))}
      </select>
    </div>
  );
};

export default ClassFilter;
