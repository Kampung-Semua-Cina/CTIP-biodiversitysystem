import { plantInfoContent } from './PlantInfoContent.js';

export function PlantInfo() {
  return (
    <div>
      <h1>{plantInfoContent.title}</h1>
      <p>{plantInfoContent.description}</p>
    </div>
  );
}