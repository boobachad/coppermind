export const handleImageUpload = () => {
  return new Promise<string | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const url = URL.createObjectURL(file);
        resolve(url);
      } else {
        resolve(null);
      }
    };
    input.click();
  });
};

export const handlePDFUpload = () => {
  return new Promise<{ src: string, name: string } | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const url = URL.createObjectURL(file);
        resolve({ src: url, name: file.name });
      } else {
        resolve(null);
      }
    };
    input.click();
  });
};
