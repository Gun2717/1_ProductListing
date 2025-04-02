const express = require('express')
const multer = require('multer')
const path = require('path')
const AWS = require('aws-sdk')
require('dotenv').config()
const bodyParser = require('body-parser')
const { on } = require('events')

AWS.config.update({
  region: process.env.REGION,
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
})
const s3 = new AWS.S3() 
const dynamodb = new AWS.DynamoDB.DocumentClient() 

const bucketName = process.env.S3_BUCKET_NAME
const tableName = process.env.DYNAMODB_TABLE_NAME

const PORT = 4000
const app = express()

const storage = multer.memoryStorage({
  destination: function (req, file, callback) {
    callback(null, '')
  },
})

const upload = multer({
  storage: storage,
  limits: { fileSize: 2000000 }, 
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb)
  },
})

function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|png|gif/ 
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase())
  const mimetype = filetypes.test(file.mimetype)
  if (mimetype && extname) {
    return cb(null, true)
  }
  return cb('Error: Images Only!')
}


app.use(express.json({ extended: false }))
app.use(express.static('./views'))

app.use(bodyParser.urlencoded({ extended: true }))

// config view
app.set('view engine', 'ejs')
app.set('views', './views')

app.get('/', async (req, res) => {
  try {
    const params = { TableName: tableName }
    const data = await dynamodb.scan(params).promise() 
    console.log('data =', data.Items)
    return res.render('index.ejs', { data: data.Items })
  } catch (error) {
    console.log(error)
    return res.status(500).json({ message: 'Internal Server Error' })
  }
})

app.post('/save', upload.single('image'), async (req, res) => {
  try {
    const maNhanSu = Number(req.body.maNhanSu)
    const hoTen = req.body.hoTen
    const namSinh = Number(req.body.namSinh)
    const phongBan = req.body.phongBan

    const image = req.file?.originalname.split('.') 
    const fileType = image[image.length - 1]
    const filePath = `${manhansu}_${Date.now().toString()}_${fileType}` 

    const paramS3 = {
      Bucket: bucketName,
      Key: filePath,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }

    s3.upload(paramS3, async (err, data) => {
      // upload ảnh lên s3
      if (err) {
        console.error('Error uploading image to S3', err)
        return res.status(500).json({ message: 'Internal Server Error' })
      } else {
        const imageURL = data.Location 
        const params = {
          TableName: tableName,
          Item: {
            maNhanSu: maNhanSu,
            hoTen: hoTen,
            namSinh: namSinh,
            phongBan: phongBan,
            hinhAnh: imageURL,
          },
        }
        await dynamodb.put(params).promise() 
        return res.redirect('/') 
      }
    })
  } catch (error) {
    console.error('Error saving data from DynamoDb ', error)
    return res.status(500).json({ message: 'Internal Server Error' })
  }
})

app.post('/delete', upload.fields([]), (req, res) => {
  const listCheckboxSelected = Object.keys(req.body) 
  if (listCheckboxSelected.length <= 0 || !listCheckboxSelected) {
    return res.redirect('/')
  }
  try {
    function onDeleteItem(length) {
      const params = {
        TableName: tableName,
        Key: {
          manhansu: Number(listCheckboxSelected[length]),
        },
      }
      dynamodb.delete(params, (err, data) => {
        if (err) {
          console.error('Error deleting data from DynamoDb ', err)
          return res.status(500).json({ message: 'Internal Server Error' })
        } else {
          if (length > 0) {
            onDeleteItem(length - 1)
          } else {
            return res.redirect('/')
          }
        }
      })
    }
    onDeleteItem(listCheckboxSelected.length - 1)
  } catch (error) {
    console.error('Error deleting data from DynamoDb ', error)
    return res.status(500).json({ message: 'Internal Server Error' })
  }

  console.log('listCheckboxSelected =', listCheckboxSelected)
})

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})