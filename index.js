// nếu ae lỗi không sử dụng import express from 'express' thì ae sử dụng câu lệnh này
const express = require('express')
const multer = require('multer')
const path = require('path')
const AWS = require('aws-sdk')
require('dotenv').config()
const bodyParser = require('body-parser')
const { on } = require('events')

// cấu hình aws sdk
AWS.config.update({
  region: process.env.REGION,
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
})
const s3 = new AWS.S3() // Khai báo s3
const dynamodb = new AWS.DynamoDB.DocumentClient() // khai báo Service dynamodb

const bucketName = process.env.S3_BUCKET_NAME
const tableName = process.env.DYNAMODB_TABLE_NAME

const PORT = 3000
const app = express()

// cấu hình multer
const storage = multer.memoryStorage({
  destination: function (req, file, callback) {
    callback(null, '')
  },
})

const upload = multer({
  storage: storage,
  limits: { fileSize: 2000000 }, // giới hạn file 2MB
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb)
  },
})
// hàm này có chức năng sẽ validate định danh file updalod có phải là ảnh không
function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|png|gif/ // kiểm tra file có phải là ảnh không
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase())
  const mimetype = filetypes.test(file.mimetype)
  if (mimetype && extname) {
    return cb(null, true)
  }
  return cb('Error: Images Only!')
}

// sử dụng middleware
app.use(express.json({ extended: false }))
app.use(express.static('./views'))
// Sử dụng body-parser để xử lý dữ liệu từ biểu mẫu
app.use(bodyParser.urlencoded({ extended: true }))

// config view
app.set('view engine', 'ejs')
app.set('views', './views')

app.get('/', async (req, res) => {
  try {
    const params = { TableName: tableName }
    const data = await dynamodb.scan(params).promise() // dùng hàm scan để lấy dữ liệu từ bảng
    console.log('data =', data.Items)
    return res.render('index.ejs', { data: data.Items })
  } catch (error) {
    console.log(error)
    return res.status(500).json({ message: 'Internal Server Error' })
  }
})
// upload.single('image') là middleware để upload 1 file duy nhất
app.post('/save', upload.single('image'), async (req, res) => {
  try {
    // lay du lieu tu form
    const maNhanSu = Number(req.body.maNhanSu)
    const hoTen = req.body.hoTen
    const namSinh = Number(req.body.namSinh)
    const phongBan = req.body.phongBan

    const image = req.file?.originalname.split('.') // kiểm tra file có tồn tại hay không sau đó nó chia chuỗi thành mảng dựa vào dấu chấm ví dụ ductai.jpg => ['ductai', 'jpg']
    const fileType = image[image.length - 1] // lấy đuôi file ví dụ: jpg, png, jpeg
    const filePath = `${manhansu}_${Date.now().toString()}_${fileType}` // đặt tên cho hình ảnh theo cấu trúc mã nhân sự + thời gian + đuôi file ví dụ: 6_1234567890_jpg

    //  cấu hình param cho S3
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
        const imageURL = data.Location // gán URL S3 vào đường dẫn image
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
        await dynamodb.put(params).promise() // lưu dữ liệu vào bảng
        return res.redirect('/') //redirect về trang chủ
      }
    })
  } catch (error) {
    console.error('Error saving data from DynamoDb ', error)
    return res.status(500).json({ message: 'Internal Server Error' })
  }
})

// bắt sự kiện xoá
// upload.fields([]) là middleware để không upload file
app.post('/delete', upload.fields([]), (req, res) => {
  const listCheckboxSelected = Object.keys(req.body) // Lấy ra tất cả checkboxes
  //kiểm tra có chọn checkbox nào không , nếu không thì trả về trang chủ
  if (listCheckboxSelected.length <= 0 || !listCheckboxSelected) {
    return res.redirect('/')
  }
  try {
    // định nghĩa hàm đệ quy xoá dữ liệu
    function onDeleteItem(length) {
      const params = {
        TableName: tableName,
        Key: {
          maNhanSu: Number(listCheckboxSelected[length]),
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
    // Nếu xoá thành công, hàm sẽ gọi lại chính nó với length giảm đi 1, tiếp tục xoá các mục khác. Hàm sẽ dừng khi length không còn lớn hơn 0.
    onDeleteItem(listCheckboxSelected.length - 1)
  } catch (error) {
    console.error('Error deleting data from DynamoDb ', error)
    return res.status(500).json({ message: 'Internal Server Error' })
  }

  console.log('listCheckboxSelected =', listCheckboxSelected)
})

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})const express = require('express')
const AWS = require('aws-sdk')
const path = require('path')
require('dotenv').config()
const multer = require('multer')

AWS.config.update({
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
    region: process.env.REGION
})

const s3 = new AWS.S3()
const dynamo = new AWS.DynamoDB.DocumentClient()
const bucketName = process.env.S3_BUCKET_NAME
const tableName = process.env.DYNAMODB_TABLE_NAME

const storage = multer.memoryStorage({
    destination: function(req, file, callback){
        callback(null, '')
    },
})

const upload = multer({
    storage: storage,
    limits:{fieldSize: 2000000},
    fileFilter: function(req, file, cb){
        checkFileType(file, cb)
    },
})

function checkFileType(file, cb){
    const filetypes = /jpeg|jpg|png|gif/
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = filetypes.test(file.mimetype)
    if(mimetype && extname){
        return cb(null, true)
    }
    return cb('Error: Images only!')
}

const PORT = 3000
const app = express()

app.use(express.json({extended: false}))
app.use(express.static('./views'))

app.set('view engine', 'ejs')
app.set('views', './views')

app.get('/', async(req, res) => {
    try {
        const params = {
            TableName: tableName, 
        }
        const data = await dynamo.scan(params).promise()
        console.log(data.Items)
        return res.render('index.ejs', {data: data.Items})
    } catch (error) {
        console.log(error)
        res.status(500).send('Internal Server Error')      
    }
})

app.listen(PORT, () =>{
    console.log('Server is running on port ${PORT}')
})