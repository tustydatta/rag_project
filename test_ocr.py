from PIL import Image
import pytesseract

# If PATH is correct, you DO NOT need this line.
# If PATH is NOT correct, uncomment and set exact path:
# pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

img = Image.open("sample.png")  # put any text image in same folder
text = pytesseract.image_to_string(img)
print(text)